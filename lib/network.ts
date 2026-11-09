import { supabase } from './supabase';

// Capability 2.12: Market, partner discovery and business opportunities (same contract as the website's lib/network.ts).
// Builds on the partner network (nexora-network: profiles, AI matches, introductions with private contacts) with a
// directory of partners and service providers, portfolios, project requests (requirements, budget, timeline),
// "get software built", and the groundwork for trust: a Verified badge set only by Nexora, reviews after an accepted
// introduction, referrals and problem reports (disputes). Commissions on introductions are planned for later.

export type Kind = 'business' | 'service_provider' | 'freelancer' | 'developer' | 'agency' | 'supplier' | 'collaborator';
export const KINDS: { k: Kind; label: string; plural: string }[] = [
  { k: 'business', label: 'Business', plural: 'Businesses' },
  { k: 'service_provider', label: 'Service provider', plural: 'Service providers' },
  { k: 'freelancer', label: 'Freelancer', plural: 'Freelancers' },
  { k: 'developer', label: 'Software developer', plural: 'Developers' },
  { k: 'agency', label: 'Agency', plural: 'Agencies' },
  { k: 'supplier', label: 'Supplier', plural: 'Suppliers' },
  { k: 'collaborator', label: 'Collaborator', plural: 'Collaborators' },
];
export const kindLabel = (k?: string) => KINDS.find(x => x.k === k)?.label ?? 'Business';

export const CATEGORIES = [
  'Websites and apps', 'Software and automation', 'Design and branding', 'Marketing and social media', 'Photography and video',
  'Writing and content', 'Accounting and tax', 'Legal and compliance', 'Logistics and delivery', 'Wholesale and supply',
  'Events', 'Training and coaching', 'Repairs and installation', 'Other',
];
/** Digital solutions: requests and providers that connect businesses with software development services. */
export const DIGITAL = ['Websites and apps', 'Software and automation'];
export const DEV_KINDS: Kind[] = ['developer', 'agency', 'freelancer'];

export type PortfolioItem = { title: string; description: string; url: string; image: string };
export type Partner = {
  user_id: string; display_name: string; industry: string; city: string; country: string; bio: string; offers: string; needs: string;
  tags: string[]; kind: Kind; categories: string[]; skills: string[]; rate: string; portfolio: PortfolioItem[]; verified: boolean;
};
export type Rating = { avg: number; count: number };
export type Review = { id: string; reviewer: string; rating: number; comment: string; created_at: string; reviewer_name: string };
export type ProjectRequest = {
  id: string; user_id: string; title: string; category: string; kind_needed: string; description: string; requirements: string[];
  budget: string; timeline: string; location: string; remote_ok: boolean; status: 'open' | 'closed'; created_at: string;
  poster?: string; replies?: number;
};
export type Extras = Pick<Partner, 'kind' | 'categories' | 'skills' | 'rate' | 'portfolio' | 'verified'>;
export const NO_EXTRAS: Extras = { kind: 'business', categories: [], skills: [], rate: '', portfolio: [], verified: false };

const COLS = 'user_id,display_name,industry,city,country,bio,offers,needs,tags,kind,categories,skills,rate,portfolio,verified';
const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows straight from the database
const norm = (r: any): Partner => ({
  ...r, tags: r.tags ?? [], categories: r.categories ?? [], skills: r.skills ?? [], rate: r.rate ?? '', kind: r.kind ?? 'business',
  portfolio: Array.isArray(r.portfolio) ? r.portfolio : [], verified: !!r.verified,
});
const fail = (e: { message: string; code?: string } | null) => {
  if (!e) return;
  if (/network_requests|network_reviews|network_referrals|network_reports|column .*(kind|categories|portfolio)/i.test(e.message))
    throw new Error('Partner directory is being set up. Ask your admin to run the 2.12 database update, then try again.');
  throw new Error(e.message);
};

/** Everyone who chose to be visible, except you. Filtered by kind, category and words. */
export async function loadDirectory(me: string, f: { kind?: Kind | ''; category?: string; q?: string } = {}): Promise<Partner[]> {
  let q = supabase.from('network_profiles').select(COLS).eq('visible', true).neq('user_id', me).order('verified', { ascending: false }).order('updated_at', { ascending: false }).limit(200);
  if (f.kind) q = q.eq('kind', f.kind);
  if (f.category) q = q.contains('categories', [f.category]);
  const { data, error } = await q;
  fail(error);
  const words = (f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (data ?? []).map(norm).filter(p => {
    if (!words.length) return true;
    const hay = [p.display_name, p.industry, p.city, p.country, p.bio, p.offers, ...p.tags, ...p.skills, ...p.categories, kindLabel(p.kind)].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

export async function loadRatings(ids: string[]): Promise<Record<string, Rating>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('network_reviews').select('reviewee,rating').in('reviewee', ids);
  const out: Record<string, Rating> = {};
  for (const r of (data ?? []) as { reviewee: string; rating: number }[]) {
    const o = out[r.reviewee] ?? { avg: 0, count: 0 };
    o.avg = (o.avg * o.count + r.rating) / (o.count + 1); o.count++;
    out[r.reviewee] = o;
  }
  return out;
}

export async function loadReviews(userId: string): Promise<Review[]> {
  const { data, error } = await supabase.from('network_reviews').select('id,reviewer,rating,comment,created_at').eq('reviewee', userId).order('created_at', { ascending: false }).limit(50);
  fail(error);
  const rows = (data ?? []) as Omit<Review, 'reviewer_name'>[];
  const { data: names } = rows.length ? await supabase.from('network_profiles').select('user_id,display_name').in('user_id', rows.map(r => r.reviewer)) : { data: [] };
  const nm = new Map(((names ?? []) as { user_id: string; display_name: string }[]).map(n => [n.user_id, n.display_name]));
  return rows.map(r => ({ ...r, reviewer_name: nm.get(r.reviewer) || 'A business on Nexora' }));
}

export async function loadExtras(me: string): Promise<Extras> {
  const { data, error } = await supabase.from('network_profiles').select('kind,categories,skills,rate,portfolio,verified').eq('user_id', me).maybeSingle();
  if (error && !/0 rows/.test(error.message)) fail(error);
  return data ? { ...NO_EXTRAS, ...norm({ ...data }) } : NO_EXTRAS;
}

/** Saved after the main profile (nexora-network "save") so the row exists. The Verified badge can't be set here. */
export async function saveExtras(me: string, x: Extras) {
  const portfolio = x.portfolio.filter(p => p.title.trim()).slice(0, 12).map(p => ({
    title: clean(p.title, 80), description: clean(p.description, 400), url: /^https?:\/\//i.test(p.url.trim()) ? clean(p.url, 300) : p.url.trim() ? `https://${clean(p.url, 290)}` : '', image: clean(p.image, 500),
  }));
  const { error } = await supabase.from('network_profiles').update({
    kind: x.kind, categories: x.categories.slice(0, 5), skills: x.skills.map(s => clean(s, 40)).filter(Boolean).slice(0, 20), rate: clean(x.rate, 80), portfolio,
  }).eq('user_id', me);
  fail(error);
}

// ---------- Project requests ----------
async function withPosters(rows: ProjectRequest[]): Promise<ProjectRequest[]> {
  const ids = [...new Set(rows.map(r => r.user_id))];
  const { data } = ids.length ? await supabase.from('network_profiles').select('user_id,display_name').in('user_id', ids) : { data: [] };
  const nm = new Map(((data ?? []) as { user_id: string; display_name: string }[]).map(n => [n.user_id, n.display_name]));
  return rows.map(r => ({ ...r, poster: nm.get(r.user_id) || 'A business on Nexora' }));
}
export async function loadOpenRequests(me: string): Promise<ProjectRequest[]> {
  const { data, error } = await supabase.from('network_requests').select('*').eq('status', 'open').neq('user_id', me).order('created_at', { ascending: false }).limit(100);
  fail(error);
  return withPosters((data ?? []) as ProjectRequest[]);
}
export async function loadMyRequests(me: string): Promise<ProjectRequest[]> {
  const { data, error } = await supabase.from('network_requests').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(100);
  fail(error);
  const rows = (data ?? []) as ProjectRequest[];
  const { data: c } = rows.length ? await supabase.from('network_connections').select('request_id').in('request_id', rows.map(r => r.id)) : { data: [] };
  const n: Record<string, number> = {};
  for (const x of (c ?? []) as { request_id: string }[]) n[x.request_id] = (n[x.request_id] ?? 0) + 1;
  return rows.map(r => ({ ...r, replies: n[r.id] ?? 0 }));
}
export type RequestForm = { title: string; category: string; kind_needed: string; description: string; requirements: string; budget: string; timeline: string; location: string; remote_ok: boolean };
export const blankRequest = (digital = false): RequestForm => ({ title: '', category: digital ? 'Websites and apps' : 'Other', kind_needed: digital ? 'developer' : 'any', description: '', requirements: '', budget: '', timeline: '', location: '', remote_ok: true });
export async function saveRequest(f: RequestForm, id?: string) {
  const row = {
    title: clean(f.title, 120), category: f.category, kind_needed: f.kind_needed, description: clean(f.description, 4000),
    requirements: f.requirements.split('\n').map(s => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 20).map(s => s.slice(0, 200)),
    budget: clean(f.budget, 80), timeline: clean(f.timeline, 80), location: clean(f.location, 80), remote_ok: f.remote_ok, updated_at: new Date().toISOString(),
  };
  if (row.title.length < 3) throw new Error('Give the project a short title');
  if (!row.description && !row.requirements.length) throw new Error('Describe what you need, or list the requirements');
  const q = id ? supabase.from('network_requests').update(row).eq('id', id) : supabase.from('network_requests').insert(row);
  const { error } = await q;
  fail(error);
}
export async function setRequestStatus(id: string, status: 'open' | 'closed') { const { error } = await supabase.from('network_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id); fail(error); }
export async function deleteRequest(id: string) { const { error } = await supabase.from('network_requests').delete().eq('id', id); fail(error); }

/** Replying to a project is an introduction linked to it: contacts are shared only if the business accepts. */
export async function replyToRequest(me: string, r: ProjectRequest, message: string) {
  const { error } = await supabase.from('network_connections').insert({
    from_user: me, to_user: r.user_id, status: 'pending', message: clean(message, 500), match_reason: `Reply to your project: ${r.title}`.slice(0, 300), request_id: r.id,
  });
  if (error?.code === '23505') throw new Error(`You're already introduced to ${r.poster || 'this business'}. Open Introductions to reach them.`);
  fail(error);
}
/** Which introductions belong to a project (id → request title). */
export async function loadIntroProjects(): Promise<Record<string, string>> {
  const { data } = await supabase.from('network_connections').select('id,request_id,network_requests(title)').not('request_id', 'is', null);
  const out: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- joined row
  for (const r of (data ?? []) as any[]) out[r.id] = (Array.isArray(r.network_requests) ? r.network_requests[0]?.title : r.network_requests?.title) || 'a project';
  return out;
}

// ---------- Trust: reviews, referrals, reports ----------
export async function myReviewedIntros(me: string): Promise<Set<string>> {
  const { data } = await supabase.from('network_reviews').select('connection_id').eq('reviewer', me);
  return new Set(((data ?? []) as { connection_id: string }[]).map(r => r.connection_id));
}
export async function addReview(me: string, connectionId: string, reviewee: string, rating: number, comment: string) {
  if (rating < 1 || rating > 5) throw new Error('Choose 1 to 5 stars');
  const { error } = await supabase.from('network_reviews').insert({ connection_id: connectionId, reviewer: me, reviewee, rating, comment: clean(comment, 1000) });
  if (error?.code === '23505') throw new Error('You have already reviewed this introduction');
  fail(error);
}
export async function addReferral(me: string, provider: string, toName: string, note: string) {
  const { error } = await supabase.from('network_referrals').insert({ referrer: me, provider, to_name: clean(toName, 120), note: clean(note, 500) });
  fail(error);
}
export async function loadReferralsCount(me: string): Promise<{ made: number; received: number }> {
  const { data } = await supabase.from('network_referrals').select('referrer,provider');
  const rows = (data ?? []) as { referrer: string; provider: string }[];
  return { made: rows.filter(r => r.referrer === me).length, received: rows.filter(r => r.provider === me).length };
}
export const REPORT_REASONS: { k: string; label: string }[] = [
  { k: 'no_show', label: "Didn't respond or deliver" }, { k: 'quality', label: 'Poor quality work' }, { k: 'payment', label: 'Payment problem' },
  { k: 'fake', label: 'Fake or misleading profile' }, { k: 'spam', label: 'Spam' }, { k: 'other', label: 'Something else' },
];
export async function reportProblem(me: string, p: { target: string; reason: string; details: string; connection_id?: string; request_id?: string }) {
  const { error } = await supabase.from('network_reports').insert({ reporter: me, target_user: p.target, reason: p.reason, details: clean(p.details, 2000), connection_id: p.connection_id ?? null, request_id: p.request_id ?? null });
  fail(error);
}

// ---------- AI: a project brief from a few words ----------
/** Nexora turns "I need an app for bookings" into a clear project request. Same route as Brain; nothing is posted until you save. */
export async function writeBrief(idea: string, business: string): Promise<Partial<RequestForm>> {
  const prompt = `A small business (${business || 'a small business'}) wants to hire someone. Turn their words into a clear project request a service provider can quote on.
Reply with ONE JSON object only, no other text: {"title": string (max 80 chars), "category": one of ${JSON.stringify(CATEGORIES)}, "kind_needed": one of ["developer","agency","freelancer","service_provider","supplier","any"], "description": string (2-4 sentences: the goal, who will use it, what success looks like), "requirements": string[] (4-8 short, specific, testable must-haves), "budget": string (a realistic range in the business's currency if it can be inferred, else ""), "timeline": string (e.g. "4-6 weeks", else "")}.
Do not invent facts about the business. Their words: """${idea.slice(0, 1500)}"""`;
  const { data: j, error } = await supabase.functions.invoke('nexora-agent', { body: { mode: 'assistant', message: prompt, history: [] } });
  if (error || !j?.success) throw new Error(j?.message || 'Nexora could not write the brief right now.');
  const m = String(j.reply || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Nexora could not write the brief right now. Try describing it in a little more detail.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI reply
  let o: any; try { o = JSON.parse(m[0]); } catch { throw new Error('Nexora could not write the brief right now. Please try again.'); }
  return {
    title: clean(o.title, 120), category: CATEGORIES.includes(o.category) ? o.category : 'Other',
    kind_needed: ['developer', 'agency', 'freelancer', 'service_provider', 'supplier', 'any'].includes(o.kind_needed) ? o.kind_needed : 'any',
    description: clean(o.description, 4000), requirements: (Array.isArray(o.requirements) ? o.requirements : []).map((s: unknown) => clean(s, 200)).filter(Boolean).join('\n'),
    budget: clean(o.budget, 80), timeline: clean(o.timeline, 80),
  };
}

/** Providers on Nexora that fit a project: right kind and category first, then words in common. */
export function rankForRequest(r: Pick<ProjectRequest, 'category' | 'kind_needed' | 'title' | 'description' | 'requirements'>, people: Partner[]): Partner[] {
  const words = new Set(`${r.title} ${r.description} ${r.requirements.join(' ')}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const score = (p: Partner) => {
    let s = 0;
    if (p.categories.includes(r.category)) s += 5;
    if (r.kind_needed !== 'any' && p.kind === r.kind_needed) s += 4; else if (DIGITAL.includes(r.category) && DEV_KINDS.includes(p.kind)) s += 3;
    const hay = `${p.offers} ${p.bio} ${p.skills.join(' ')} ${p.tags.join(' ')}`.toLowerCase();
    for (const w of words) if (hay.includes(w)) s += 1;
    if (p.verified) s += 1;
    return s;
  };
  return people.map(p => ({ p, s: score(p) })).filter(x => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.p);
}
