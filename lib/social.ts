import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const clientNow = () => {
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* keep UTC */ }
  const d = new Date();
  return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), tz, tz_offset_min: -d.getTimezoneOffset() };
};
/** Calls a Nexora server function as the signed-in owner. */
async function callFn<T = any>(name: string, body: Record<string, unknown>, ms = 30000): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.success === false) throw new Error(out?.message || `Request failed (${res.status}).`);
    return out as T;
  } catch (e: any) { if (e?.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.'); throw e; }
  finally { clearTimeout(t); }
}

// Social Media Connection and Multi-Platform Publishing (blueprint 2.3). Accounts (several per platform), one post
// adapted for each chosen account, drafts, scheduling, a queue, publishing, history, retries, a calendar and performance.
// Nexora posts for you on Facebook Pages and Instagram professional accounts (Meta); for other platforms it prepares
// the post and you post it yourself (the app explains why). The website has the same rules in src/lib/social.ts.

export type PlatformKey = 'facebook' | 'instagram' | 'tiktok' | 'x' | 'linkedin' | 'youtube' | 'whatsapp' | 'threads' | 'pinterest';
export type PlatformInfo = {
  key: PlatformKey; name: string; limit: number; ideal: number; size: string; media: 'none' | 'image' | 'video'; links: boolean; hashtags: number;
  api: boolean; tip: string;
};
export const PLATFORMS: PlatformInfo[] = [
  { key: 'facebook', name: 'Facebook', limit: 63206, ideal: 400, size: '1200 × 630', media: 'none', links: true, hashtags: 3, api: true, tip: 'Short and friendly; links are clickable; 1–3 hashtags.' },
  { key: 'instagram', name: 'Instagram', limit: 2200, ideal: 900, size: '1080 × 1080', media: 'image', links: false, hashtags: 10, api: true, tip: 'Needs a picture; links are not clickable (say “link in bio”); 5–10 hashtags.' },
  { key: 'tiktok', name: 'TikTok', limit: 2200, ideal: 150, size: '1080 × 1920 video', media: 'video', links: false, hashtags: 5, api: false, tip: 'A short hook for a vertical video; 3–5 hashtags.' },
  { key: 'x', name: 'X', limit: 280, ideal: 260, size: '1600 × 900', media: 'none', links: true, hashtags: 2, api: false, tip: 'At most 280 characters (a link counts as 23); 1–2 hashtags.' },
  { key: 'linkedin', name: 'LinkedIn', limit: 3000, ideal: 1300, size: '1200 × 627', media: 'none', links: true, hashtags: 3, api: false, tip: 'Professional tone, a clear first line; 3 hashtags.' },
  { key: 'youtube', name: 'YouTube', limit: 5000, ideal: 1000, size: '1920 × 1080 video', media: 'video', links: true, hashtags: 3, api: false, tip: 'A title (up to 100 characters) on the first line, then the description.' },
  { key: 'whatsapp', name: 'WhatsApp', limit: 700, ideal: 500, size: '1080 × 1920', media: 'none', links: true, hashtags: 0, api: false, tip: 'Status or Channel: plain and personal, no hashtags.' },
  { key: 'threads', name: 'Threads', limit: 500, ideal: 400, size: '1080 × 1350', media: 'none', links: true, hashtags: 1, api: false, tip: 'Conversational; up to 500 characters; one topic tag.' },
  { key: 'pinterest', name: 'Pinterest', limit: 500, ideal: 300, size: '1000 × 1500', media: 'image', links: true, hashtags: 0, api: false, tip: 'Needs a tall picture; a keyword-rich description and a link.' },
];
export const platform = (k: string) => PLATFORMS.find(p => p.key === k) ?? PLATFORMS[0];

export type SocialAccount = { id: string; platform: PlatformKey; mode: 'api' | 'manual'; name: string; handle: string; status: 'connected' | 'needs_reauth' | 'disconnected'; status_note: string; permissions: string[]; connected_at: string };
export type Media = { url: string; type: string };
export type TargetStatus = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published' | 'failed' | 'needs_manual' | 'skipped';
export type Target = {
  id: string; post_id: string; account_id: string | null; platform: PlatformKey; account_name: string; body: string; media: Media[]; status: TargetStatus;
  scheduled_at: string | null; published_at: string | null; permalink: string; error: string; attempts: number; history: { at: string; text: string }[];
  metrics: Record<string, number | string>; metrics_at: string | null;
};
export type PostStatus = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'ready' | 'published' | 'partly_published' | 'failed' | 'archived';
export type SocialPost = { id: string; title: string; body: string; media: Media[]; link: string; cta: string; status: PostStatus; scheduled_at: string | null; created_at: string; updated_at: string; targets: Target[] };

const GREY = { bg: '#F2F4F7', fg: '#5C6B7A' }, BLUE = { bg: '#EAF1FB', fg: '#1E56A0' }, AMBER = { bg: '#FDF3E1', fg: '#B7791F' }, GREEN = { bg: '#E6F4ED', fg: '#1E9E6D' }, RED = { bg: '#FDECEC', fg: '#B42318' };
export const POST_STATUS: Record<PostStatus, { t: string; bg: string; fg: string }> = {
  draft: { t: 'Draft', ...GREY }, scheduled: { t: 'Scheduled', ...BLUE }, queued: { t: 'In queue', ...BLUE }, publishing: { t: 'Publishing', ...AMBER }, ready: { t: 'Ready for you to post', ...AMBER },
  published: { t: 'Published', ...GREEN }, partly_published: { t: 'Partly published', ...AMBER }, failed: { t: 'Failed', ...RED }, archived: { t: 'Archived', ...GREY },
};
export const TARGET_STATUS: Record<TargetStatus, { t: string; bg: string; fg: string }> = {
  draft: { t: 'Draft', ...GREY }, scheduled: { t: 'Scheduled', ...BLUE }, queued: { t: 'In queue', ...BLUE }, publishing: { t: 'Publishing', ...AMBER },
  published: { t: 'Published', ...GREEN }, failed: { t: 'Failed', ...RED }, needs_manual: { t: 'Post it yourself', ...AMBER }, skipped: { t: 'Skipped', ...GREY },
};

// ---------- Accounts ----------
export async function loadAccounts(): Promise<SocialAccount[]> {
  const { data, error } = await supabase.from('social_accounts').select('id,platform,mode,name,handle,status,status_note,permissions,connected_at').order('platform').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as SocialAccount[];
}
export async function addManualAccount(f: { platform: PlatformKey; name: string; handle: string }) {
  if (!f.name.trim()) throw new Error('Give the account a name');
  const { error } = await supabase.from('social_accounts').insert({ platform: f.platform, mode: 'manual', name: f.name.trim().slice(0, 120), handle: f.handle.trim().slice(0, 120), permissions: ['prepare'] });
  if (error) throw new Error(error.message);
}
export async function renameAccount(id: string, name: string, handle: string) {
  const { error } = await supabase.from('social_accounts').update({ name: name.trim().slice(0, 120), handle: handle.trim().slice(0, 120) }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function removeAccount(id: string) {
  const { error } = await supabase.from('social_accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export type Caps = { caps: Record<string, { publish: boolean; note: string; metrics: boolean }>; meta_ready: boolean };
export const loadCaps = () => callFn<Caps>('social-publish', { action: 'capabilities' });
export async function startMetaLogin() { const r = await callFn<{ url: string }>('social-publish', { action: 'oauth_start' }); return r.url; }

/** Uploads a picture or video picked on the phone (straight from disk, so large files don't freeze the app). */
export async function uploadMedia(userId: string, uri: string, type: string): Promise<{ url: string; type: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const isVideo = type.startsWith('video');
  const path = `${userId}/social/${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
  const ct = isVideo ? 'video/mp4' : 'image/jpeg';
  const headers = { 'Content-Type': ct, Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY };
  const target = `${SUPABASE_URL}/storage/v1/object/chat-uploads/${path}`;
  let status = 0;
  if (Platform.OS === 'web') { const blob = await (await fetch(uri)).blob(); status = (await fetch(target, { method: 'POST', headers, body: blob })).status; }
  else status = (await FileSystem.uploadAsync(target, uri, { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers })).status;
  if (status < 200 || status >= 300) throw new Error(`Upload failed (${status}).`);
  return { url: supabase.storage.from('chat-uploads').getPublicUrl(path).data.publicUrl, type: ct };
}

// ---------- Posts ----------
const POST_COLS = 'id,title,body,media,link,cta,status,scheduled_at,created_at,updated_at';
const TARGET_COLS = 'id,post_id,account_id,platform,account_name,body,media,status,scheduled_at,published_at,permalink,error,attempts,history,metrics,metrics_at';
export async function loadPosts(): Promise<SocialPost[]> {
  const [p, t] = await Promise.all([
    supabase.from('social_posts').select(POST_COLS).order('updated_at', { ascending: false }).limit(300),
    supabase.from('social_post_targets').select(TARGET_COLS).order('created_at').limit(2000),
  ]);
  if (p.error) throw new Error(p.error.message);
  const by = new Map<string, Target[]>();
  for (const x of (t.data ?? []) as Target[]) by.set(x.post_id, [...(by.get(x.post_id) ?? []), { ...x, history: Array.isArray(x.history) ? x.history : [], media: Array.isArray(x.media) ? x.media : [], metrics: x.metrics ?? {} }]);
  return ((p.data ?? []) as Omit<SocialPost, 'targets'>[]).map(x => ({ ...x, media: Array.isArray(x.media) ? x.media : [], targets: by.get(x.id) ?? [] }));
}

export type Draft = { id?: string; title: string; body: string; media: Media[]; link: string; cta: string; versions: Record<string, string>; accountIds: string[] };
export const emptyDraft = (): Draft => ({ title: '', body: '', media: [], link: '', cta: '', versions: {}, accountIds: [] });
export const draftFromPost = (p: SocialPost): Draft => ({
  id: p.id, title: p.title, body: p.body, media: p.media, link: p.link, cta: p.cta,
  versions: Object.fromEntries(p.targets.filter(t => t.account_id).map(t => [t.account_id!, t.body])), accountIds: p.targets.filter(t => t.account_id && t.status !== 'skipped').map(t => t.account_id!),
});

/** Saves the post and one copy per chosen account. Copies already published are kept as they are. */
export async function saveDraft(d: Draft, accounts: SocialAccount[], when?: { status: 'draft' | 'scheduled' | 'queued'; at: string | null }): Promise<string> {
  if (!d.body.trim() && !d.media.length) throw new Error('Write something or add a picture first');
  if (!d.accountIds.length) throw new Error('Choose at least one account to post to');
  const status = when?.status ?? 'draft';
  const row = { title: (d.title.trim() || d.body.trim().split('\n')[0]).slice(0, 120), body: d.body.slice(0, 5000), media: d.media, link: d.link.trim().slice(0, 500), cta: d.cta.trim().slice(0, 120), status, scheduled_at: when?.at ?? null };
  const r = d.id ? await supabase.from('social_posts').update(row).eq('id', d.id).select('id').single() : await supabase.from('social_posts').insert(row).select('id').single();
  if (r.error) throw new Error(r.error.message);
  const id = r.data.id as string;
  const { data: existing } = await supabase.from('social_post_targets').select('id,account_id,status').eq('post_id', id);
  const keep = new Set((existing ?? []).filter(t => t.status === 'published').map(t => t.account_id));
  const drop = (existing ?? []).filter(t => t.status !== 'published').map(t => t.id);
  if (drop.length) { const del = await supabase.from('social_post_targets').delete().in('id', drop); if (del.error) throw new Error(del.error.message); }
  const rows = d.accountIds.filter(a => !keep.has(a)).map(a => {
    const acc = accounts.find(x => x.id === a)!;
    return { post_id: id, account_id: a, platform: acc.platform, account_name: acc.name, body: (d.versions[a] ?? adaptLocal(d, acc.platform)).slice(0, 5000), media: d.media, status, scheduled_at: when?.at ?? null, history: [{ at: new Date().toISOString(), text: status === 'draft' ? 'Saved as a draft' : status === 'queued' ? `Added to the queue for ${new Date(when!.at!).toLocaleString()}` : `Scheduled for ${new Date(when!.at!).toLocaleString()}` }] };
  });
  if (rows.length) { const ins = await supabase.from('social_post_targets').insert(rows); if (ins.error) throw new Error(ins.error.message); }
  return id;
}

/** Queue times: the next free slot (9:00, 13:00 or 18:00, your time) at least 15 minutes away, one post per slot. */
export const QUEUE_SLOTS = ['09:00', '13:00', '18:00'];
export function nextQueueSlot(posts: SocialPost[]): string {
  const taken = new Set(posts.filter(p => p.status === 'queued' || p.status === 'scheduled').map(p => p.scheduled_at && new Date(p.scheduled_at).getTime()));
  const start = Date.now() + 15 * 60000;
  for (let day = 0; day < 60; day++) for (const s of QUEUE_SLOTS) {
    const d = new Date(); d.setDate(d.getDate() + day); const [h, m] = s.split(':').map(Number); d.setHours(h, m, 0, 0);
    if (d.getTime() >= start && !taken.has(d.getTime())) return d.toISOString();
  }
  return new Date(start).toISOString();
}

export async function publishNow(postId: string) {
  return callFn<{ targets: { id: string; status: TargetStatus; error: string; permalink: string; account_name: string; platform: string }[] }>('social-publish', { action: 'publish', post_id: postId }, 120000);
}
export const retryTarget = (id: string) => callFn<{ targets: { status: TargetStatus; error: string }[] }>('social-publish', { action: 'retry', target_id: id }, 90000);
export const refreshMetrics = (postId?: string) => callFn('social-publish', { action: 'metrics', post_id: postId }, 90000);

const hist = (t: Target, text: string) => [...t.history, { at: new Date().toISOString(), text }].slice(-30);
/** For accounts you post to yourself: record that it went out (and where), so history and the calendar are complete. */
export async function markPublished(t: Target, link: string) {
  const { error } = await supabase.from('social_post_targets').update({ status: 'published', published_at: new Date().toISOString(), permalink: link.trim().slice(0, 500), error: '', history: hist(t, 'You posted it yourself') }).eq('id', t.id);
  if (error) throw new Error(error.message);
  await settlePost(t.post_id);
}
export async function skipTarget(t: Target) {
  const { error } = await supabase.from('social_post_targets').update({ status: 'skipped', history: hist(t, 'Skipped') }).eq('id', t.id);
  if (error) throw new Error(error.message);
  await settlePost(t.post_id);
}
/** Numbers you copy from the platform's own insights, for accounts Nexora can't read. */
export async function saveManualMetrics(t: Target, m: Record<string, number>) {
  const { error } = await supabase.from('social_post_targets').update({ metrics: { ...m, source: 'you' }, metrics_at: new Date().toISOString() }).eq('id', t.id);
  if (error) throw new Error(error.message);
}
/** Recomputes the post's status from its copies (same rules as the server). */
export async function settlePost(postId: string) {
  const { data: post } = await supabase.from('social_posts').select('status').eq('id', postId).maybeSingle();
  if (!post || post.status === 'archived') return;
  const { data: ts } = await supabase.from('social_post_targets').select('status').eq('post_id', postId);
  const s: TargetStatus[] = (ts ?? []).map(t => t.status as TargetStatus).filter(x => x !== 'skipped');
  if (!s.length) return;
  const all = (k: TargetStatus) => s.every(x => x === k), any = (k: TargetStatus) => s.includes(k);
  const next: PostStatus = all('published') ? 'published' : any('publishing') ? 'publishing' : any('published') ? 'partly_published'
    : any('scheduled') ? 'scheduled' : any('queued') ? 'queued' : any('needs_manual') ? 'ready' : any('failed') ? 'failed' : (post.status as PostStatus);
  if (next !== post.status) await supabase.from('social_posts').update({ status: next }).eq('id', postId);
}
export async function setArchived(p: SocialPost, archived: boolean) {
  const { error } = await supabase.from('social_posts').update({ status: archived ? 'archived' : 'draft' }).eq('id', p.id);
  if (error) throw new Error(error.message);
  if (!archived) await settlePost(p.id);
}
export async function deletePost(id: string) {
  const { error } = await supabase.from('social_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
/** Reuse: a new draft with the same words, pictures and accounts. */
export const reuse = (p: SocialPost): Draft => ({ ...draftFromPost(p), id: undefined, title: `Again: ${p.title || 'Post'}`.slice(0, 120) });

// ---------- Adapting one post for each platform ----------
const tagsOf = (t: string) => t.match(/#[\p{L}\p{N}_]+/gu) ?? [];
const stripTags = (t: string) => t.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').trim();
/** Rules-based version for each platform (used straight away, and whenever the AI is busy). */
export function adaptLocal(d: Pick<Draft, 'body' | 'link' | 'cta'>, k: PlatformKey): string {
  const p = platform(k);
  const base = stripTags(d.body);
  const tags = tagsOf(d.body).slice(0, p.hashtags);
  const cta = d.cta.trim();
  const link = d.link.trim();
  const linkLine = link ? (p.links ? link : 'Link in bio') : '';
  let out = [base, cta, linkLine].filter(Boolean).join('\n\n');
  if (tags.length) out += `\n\n${tags.join(' ')}`;
  if (k === 'x') {
    const tail = [cta, link].filter(Boolean).join(' ');
    const room = 280 - (link ? 23 + (cta ? cta.length + 1 : 0) + 1 : (cta ? cta.length + 1 : 0)) - (tags[0] ? tags[0].length + 1 : 0);
    const short = base.replace(/\s+/g, ' ');
    out = `${short.length > room ? `${short.slice(0, Math.max(20, room - 1)).replace(/\s\S*$/, '')}…` : short}${tail ? ` ${tail}` : ''}${tags[0] ? ` ${tags[0]}` : ''}`;
  }
  if (k === 'tiktok') {
    // A hook for the video: the opening sentences, up to about 150 characters.
    let hook = '';
    for (const sentence of base.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)) { if (hook && (hook + ' ' + sentence).length > 150) break; hook = hook ? `${hook} ${sentence}` : sentence; }
    out = `${hook.slice(0, 150)}${cta ? ` ${cta}` : ''}${tags.length ? ` ${tags.join(' ')}` : ''}`;
  }
  if (k === 'youtube') { const lines = base.split('\n'); out = `${lines[0].slice(0, 100)}\n\n${[lines.slice(1).join('\n').trim() || base, cta, link].filter(Boolean).join('\n\n')}`; }
  // X is already sized above (a link counts as 23 characters there), so it must not be cut again.
  return k === 'x' ? out : out.slice(0, p.limit);
}
/** Warnings for one platform's copy: too long, missing picture or video, links that won't be clickable. */
export function checks(k: PlatformKey, text: string, media: Media[]): string[] {
  const p = platform(k); const w: string[] = [];
  const len = k === 'x' ? text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length : text.length;
  if (len > p.limit) w.push(`Too long for ${p.name}: ${len.toLocaleString()} of ${p.limit.toLocaleString()} characters.`);
  if (p.media === 'image' && !media.some(m => m.type.startsWith('image'))) w.push(`${p.name} needs a picture.`);
  if (p.media === 'video' && !media.some(m => m.type.startsWith('video'))) w.push(`${p.name} is for video: add your video in ${p.name} when you post.`);
  if (!p.links && /https?:\/\//.test(text)) w.push(`Links aren't clickable on ${p.name}: say “link in bio” instead.`);
  if (tagsOf(text).length > Math.max(p.hashtags, 1) + 2) w.push(`Use about ${p.hashtags || 'no'} hashtags on ${p.name}.`);
  return w;
}
/** Nexora's AI writes each platform's version (tone, length, hashtags, CTA). Falls back to the rules version per platform. */
export async function adaptWithAI(d: Draft, keys: PlatformKey[]): Promise<{ versions: Partial<Record<PlatformKey, string>>; ai: boolean }> {
  const uniq = [...new Set(keys)];
  const spec = uniq.map(k => { const p = platform(k); return `- ${k}: at most ${p.limit} characters (aim for ${p.ideal}); ${p.tip}`; }).join('\n');
  const prompt = `Adapt this social media post for each platform listed. Keep the same facts and offer; change tone, length, line breaks, hashtags and the call to action to suit each platform. Do not invent prices, discounts or claims. Reply with JSON only, no other text, in the form {"platform_key": "post text", ...}.\n\nPlatforms:\n${spec}\n\nThe post:\n${d.body}\n${d.cta ? `\nCall to action: ${d.cta}` : ''}${d.link ? `\nLink: ${d.link}` : ''}`;
  const local = Object.fromEntries(uniq.map(k => [k, adaptLocal(d, k)])) as Record<PlatformKey, string>;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 70000);
    const res = await fetch(`${FUNCTIONS_URL}/nexora-agent`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ mode: 'assistant', long: true, message: `${prompt}\n\nOnly write the JSON: do not take any actions or change anything in my account.`, history: [], client_now: clientNow() }) }).finally(() => clearTimeout(timer));
    const j = await res.json().catch(() => ({}));
    const m = String(j?.reply ?? '').match(/\{[\s\S]*\}/);
    if (!res.ok || !j?.success || !m) return { versions: local, ai: false };
    const parsed = JSON.parse(m[0]) as Record<string, unknown>;
    const out: Partial<Record<PlatformKey, string>> = {};
    for (const k of uniq) out[k] = typeof parsed[k] === 'string' && (parsed[k] as string).trim() ? (parsed[k] as string).trim().slice(0, platform(k).limit) : local[k];
    return { versions: out, ai: true };
  } catch { return { versions: local, ai: false }; }
}

// ---------- Performance ----------
export const METRIC_LABEL: Record<string, string> = { likes: 'Likes', comments: 'Comments', shares: 'Shares', reach: 'Reach', impressions: 'Views', clicks: 'Clicks', saved: 'Saves' };
export function totals(posts: SocialPost[]) {
  const t: Record<string, number> = {};
  for (const p of posts) for (const x of p.targets) for (const [k, v] of Object.entries(x.metrics)) if (typeof v === 'number') t[k] = (t[k] ?? 0) + v;
  return t;
}
