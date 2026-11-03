import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Text, TextInput } from '../lib/inter';
import {
  METRIC_LABEL, PLATFORMS, POST_STATUS, QUEUE_SLOTS, TARGET_STATUS, adaptLocal, adaptWithAI, addManualAccount, checks, deletePost, draftFromPost, emptyDraft,
  loadAccounts, loadCaps, loadPosts, markPublished, nextQueueSlot, platform, publishNow, refreshMetrics, removeAccount, renameAccount, retryTarget, reuse,
  saveDraft, saveManualMetrics, setArchived, skipTarget, startMetaLogin, totals, uploadMedia,
  type Caps, type Draft, type PlatformKey, type SocialAccount, type SocialPost, type Target,
} from '../lib/social';

// Social Media Connection and Multi-Platform Publishing (blueprint 2.3), the app's screen. Same data and rules as the
// website's /publish: accounts, write once and adapt per platform, draft / schedule / queue / publish, history and retry,
// a calendar and performance.
const TITLE = 'Social Media Connection and Multi-Platform Publishing';
type Tab = 'create' | 'posts' | 'calendar' | 'accounts' | 'performance';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'create', label: 'Create', icon: 'create-outline' }, { k: 'posts', label: 'Posts', icon: 'list-outline' }, { k: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { k: 'accounts', label: 'Accounts', icon: 'people-outline' }, { k: 'performance', label: 'Performance', icon: 'bar-chart-outline' },
];
const ICON: Record<PlatformKey, { name: string; color: string }> = {
  facebook: { name: 'logo-facebook', color: '#1877F2' }, instagram: { name: 'logo-instagram', color: '#C13584' }, tiktok: { name: 'logo-tiktok', color: '#0B1220' },
  x: { name: 'logo-twitter', color: '#0B1220' }, linkedin: { name: 'logo-linkedin', color: '#0A66C2' }, youtube: { name: 'logo-youtube', color: '#FF0000' },
  whatsapp: { name: 'logo-whatsapp', color: '#25D366' }, threads: { name: 'at-outline', color: '#0B1220' }, pinterest: { name: 'logo-pinterest', color: '#E60023' },
};
const OPEN_URL: Record<PlatformKey, string> = {
  facebook: 'https://www.facebook.com/', instagram: 'https://www.instagram.com/', tiktok: 'https://www.tiktok.com/upload', x: 'https://x.com/compose/post',
  linkedin: 'https://www.linkedin.com/feed/', youtube: 'https://studio.youtube.com/', whatsapp: 'https://web.whatsapp.com/', threads: 'https://www.threads.net/', pinterest: 'https://www.pinterest.com/pin-builder/',
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const PIcon = ({ k, size = 18 }: { k: PlatformKey; size?: number }) => <Ionicons name={ICON[k].name as any} size={size} color={ICON[k].color} />;
const Pill = ({ s: st }: { s: { t: string; bg: string; fg: string } }) => <View style={{ backgroundColor: st.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: st.fg, fontSize: 11.5, fontWeight: '600' }}>{st.t}</Text></View>;

export function SocialPublisher({ userId, onBack, flash, topInset = 0, wide = false }: { userId: string; onBack: () => void; flash: (t: string) => void; topInset?: number; wide?: boolean }) {
  const [tab, setTab] = useState<Tab>('create');
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const reload = useCallback((): Promise<void> => Promise.all([
    loadAccounts().catch(e => { flash((e as Error).message); return [] as SocialAccount[]; }),
    loadPosts().catch(e => { flash((e as Error).message); return [] as SocialPost[]; }),
  ]).then(([a, p]) => { setAccounts(a); setPosts(p); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); loadCaps().then(setCaps, () => setCaps(null)); }, [reload]);
  const todo = useMemo(() => {
    const ts = (posts ?? []).filter(p => p.status !== 'archived').flatMap(p => p.targets);
    return { manual: ts.filter(t => t.status === 'needs_manual').length, failed: ts.filter(t => t.status === 'failed').length, reauth: (accounts ?? []).filter(a => a.status === 'needs_reauth').length };
  }, [posts, accounts]);
  const edit = (d: Draft) => { setDraft(d); setTab('create'); };

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{TITLE}</Text>
        <Pressable onPress={() => reload().then(() => flash('Up to date'))} hitSlop={8} accessibilityLabel="Refresh"><Ionicons name="refresh-outline" size={22} color="#0B1220" /></Pressable>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {TABS.map(t => {
            const n = t.k === 'posts' ? todo.manual + todo.failed : t.k === 'accounts' ? todo.reauth : 0;
            return (
              <Pressable key={t.k} onPress={() => setTab(t.k)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.k }} style={[s.tab, tab === t.k && s.tabOn]}>
                <Ionicons name={t.icon as any} size={16} color={tab === t.k ? '#FFF' : '#1F2A37'} />
                <Text style={[s.tabText, tab === t.k && { color: '#FFF' }]}>{t.label}</Text>
                {n > 0 && <View style={s.badge}><Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>{n}</Text></View>}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {accounts === null || posts === null ? <ActivityIndicator style={{ marginTop: 40 }} color="#1E56A0" /> : (
        <ScrollView contentContainerStyle={[s.body, wide && s.wide]} keyboardShouldPersistTaps="handled">
          {(todo.manual > 0 || todo.failed > 0 || todo.reauth > 0) && tab !== 'posts' && tab !== 'accounts' && (
            <Pressable onPress={() => setTab(todo.reauth && !todo.manual && !todo.failed ? 'accounts' : 'posts')} style={s.warnBox}>
              <Ionicons name="alert-circle-outline" size={20} color="#B7791F" />
              <Text style={{ flex: 1, color: '#8A5A00', fontSize: 13 }}>{[todo.manual ? `${todo.manual} ready for you to post` : '', todo.failed ? `${todo.failed} couldn't be published` : '', todo.reauth ? `${todo.reauth} account${todo.reauth === 1 ? '' : 's'} to reconnect` : ''].filter(Boolean).join(' · ')}</Text>
              <Text style={s.link}>Open</Text>
            </Pressable>
          )}
          {tab === 'create' && <Compose userId={userId} draft={draft} setDraft={setDraft} accounts={accounts} posts={posts} flash={flash} onDone={async t => { setDraft(emptyDraft()); await reload(); setTab(t); }} goAccounts={() => setTab('accounts')} />}
          {tab === 'posts' && <Posts posts={posts} flash={flash} reload={reload} edit={edit} />}
          {tab === 'calendar' && <Calendar posts={posts} />}
          {tab === 'accounts' && <Accounts accounts={accounts} caps={caps} flash={flash} reload={reload} />}
          {tab === 'performance' && <Performance posts={posts} flash={flash} reload={reload} />}
        </ScrollView>
      )}
    </View>
  );
}

// ---------- Create ----------
function Compose({ userId, draft: d, setDraft, accounts, posts, flash, onDone, goAccounts }: {
  userId: string; draft: Draft; setDraft: (d: Draft) => void; accounts: SocialAccount[]; posts: SocialPost[]; flash: (t: string) => void; onDone: (t: Tab) => Promise<void>; goAccounts: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [sched, setSched] = useState<{ date: string; time: string } | null>(null);
  const [adapted, setAdapted] = useState<'ai' | 'rules' | null>(null);
  const usable = accounts.filter(a => a.status !== 'disconnected');
  const chosen = usable.filter(a => d.accountIds.includes(a.id));
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const versionOf = (a: SocialAccount) => d.versions[a.id] ?? adaptLocal(d, a.platform);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsEditing: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if ((a.fileSize ?? 0) > 20 * 1024 * 1024) { flash('Choose a file under 20 MB'); return; }
    setBusy('upload');
    try { const m = await uploadMedia(userId, a.uri, a.type === 'video' ? 'video/mp4' : 'image/jpeg'); set({ media: [...d.media, m] }); } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const adapt = async () => {
    if (!d.body.trim()) { flash('Write the post first'); return; }
    if (!chosen.length) { flash('Choose the accounts first'); return; }
    setBusy('adapt');
    const r = await adaptWithAI(d, chosen.map(a => a.platform));
    set({ versions: { ...d.versions, ...Object.fromEntries(chosen.map(a => [a.id, r.versions[a.platform] ?? adaptLocal(d, a.platform)])) } });
    setAdapted(r.ai ? 'ai' : 'rules'); setBusy('');
    flash(r.ai ? 'Nexora adapted the post for each platform' : 'Adapted with Nexora’s platform rules (the AI is busy right now)');
  };
  const finish = async (kind: 'draft' | 'schedule' | 'queue' | 'publish', at?: string) => {
    setBusy(kind);
    try {
      const status = kind === 'schedule' ? 'scheduled' : kind === 'queue' ? 'queued' : 'draft';
      const atIso = kind === 'schedule' ? at! : kind === 'queue' ? nextQueueSlot(posts) : null;
      const id = await saveDraft({ ...d, versions: Object.fromEntries(chosen.map(a => [a.id, versionOf(a)])) }, accounts, { status, at: atIso });
      if (kind === 'publish') {
        const r = await publishNow(id);
        const ok = r.targets.filter(t => t.status === 'published').length, me = r.targets.filter(t => t.status === 'needs_manual').length, bad = r.targets.filter(t => t.status === 'failed');
        flash([ok ? `Published on ${ok}` : '', me ? `${me} ready for you to post` : '', bad.length ? `${bad.length} failed: ${bad[0].error}` : ''].filter(Boolean).join(' · ') || 'Done');
      } else flash(kind === 'draft' ? 'Saved as a draft' : kind === 'queue' ? `Added to the queue for ${when(atIso)}` : `Scheduled for ${when(atIso)}`);
      setSched(null); setAdapted(null);
      await onDone(kind === 'draft' || kind === 'publish' ? 'posts' : 'calendar');
    } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  if (!usable.length) return (
    <View style={[s.card, { alignItems: 'center' }]}>
      <Text style={s.bold}>Connect or add an account first</Text>
      <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>Add the Facebook Pages, Instagram, TikTok, X, LinkedIn or other accounts you post to. You can add several on the same platform.</Text>
      <Btn label="Add accounts" icon="add" onPress={goAccounts} />
    </View>
  );
  return (
    <>
      <View style={s.card}>
        <Text style={s.cardTitle}>{d.id ? 'Edit post' : 'Write once'}</Text>
        <Text style={s.label}>Post</Text>
        <TextInput value={d.body} onChangeText={t => set({ body: t })} multiline maxLength={5000} placeholder="What do you want to tell your customers? Add #hashtags if you like." placeholderTextColor="#A5AFBB" style={[s.input, { height: 130, textAlignVertical: 'top', paddingTop: 10 }]} />
        <Text style={[s.tiny, { textAlign: 'right' }]}>{d.body.length} characters</Text>
        <Text style={s.label}>Call to action</Text>
        <TextInput value={d.cta} onChangeText={t => set({ cta: t })} maxLength={120} placeholder="e.g. Order on WhatsApp today" placeholderTextColor="#A5AFBB" style={s.input} />
        <Text style={s.label}>Link (optional)</Text>
        <TextInput value={d.link} onChangeText={t => set({ link: t })} maxLength={500} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor="#A5AFBB" style={s.input} />
        <Text style={s.label}>Pictures or video</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {d.media.map((m, i) => (
            <View key={m.url} style={s.thumb}>
              {m.type.startsWith('video') ? <Text style={s.tiny}>Video</Text> : <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} />}
              <Pressable onPress={() => set({ media: d.media.filter((_, j) => j !== i) })} hitSlop={6} accessibilityLabel="Remove" style={{ position: 'absolute', top: 2, right: 2 }}><Ionicons name="close-circle" size={20} color="#D64545" /></Pressable>
            </View>
          ))}
          <Pressable onPress={pick} disabled={busy === 'upload'} style={[s.thumb, { borderStyle: 'dashed' }]} accessibilityLabel="Add a picture or video">
            {busy === 'upload' ? <ActivityIndicator color="#1E56A0" /> : <><Ionicons name="image-outline" size={22} color="#5C6B7A" /><Text style={s.tiny}>Add</Text></>}
          </Pressable>
        </View>
        <Text style={s.label}>Post to</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {usable.map(a => {
            const on = d.accountIds.includes(a.id);
            return (
              <Pressable key={a.id} onPress={() => set({ accountIds: on ? d.accountIds.filter(x => x !== a.id) : [...d.accountIds, a.id] })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[s.pick, on && s.pickOn]}>
                <PIcon k={a.platform} size={16} /><Text style={[s.pickText, on && { color: '#1E56A0' }]}>{a.name}{a.mode === 'manual' ? ' · you post' : ''}</Text>
                {a.status === 'needs_reauth' && <Ionicons name="warning-outline" size={14} color="#D64545" />}
              </Pressable>
            );
          })}
        </View>
        <Btn soft label={busy === 'adapt' ? 'Adapting…' : 'Adapt for each platform'} icon="sparkles" disabled={busy === 'adapt'} onPress={adapt} />
      </View>

      <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>Preview for each account</Text>{adapted && <Text style={s.tiny}>{adapted === 'ai' ? 'Written by Nexora' : 'Platform rules'}</Text>}</View>
      {!chosen.length ? <View style={s.card}><Text style={s.small}>Choose the accounts to post to. Each gets its own version you can change.</Text></View> : chosen.map(a => {
        const p = platform(a.platform), text = versionOf(a), warn = checks(a.platform, text, d.media);
        return (
          <View key={a.id} style={s.card}>
            <View style={s.row}>
              <PIcon k={a.platform} size={22} />
              <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{a.name} <Text style={s.small}>{a.handle}</Text></Text>
                <Text style={s.tiny}>{p.name} · {a.mode === 'api' ? 'Nexora posts it' : 'You post it (Nexora prepares it)'} · {p.size}</Text></View>
              <Text style={[s.tiny, text.length > p.limit && { color: '#D64545', fontWeight: '700' }]}>{text.length}/{p.limit.toLocaleString()}</Text>
            </View>
            <TextInput value={text} onChangeText={t => set({ versions: { ...d.versions, [a.id]: t } })} multiline accessibilityLabel={`${a.name} version`} style={[s.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 10, marginTop: 8 }]} />
            <Text style={[s.tiny, { marginTop: 6 }]}>{p.tip}</Text>
            {warn.map(w => <View key={w} style={[s.row, { marginTop: 4 }]}><Ionicons name="warning-outline" size={14} color="#B7791F" /><Text style={{ flex: 1, fontSize: 12, color: '#8A5A00' }}>{w}</Text></View>)}
            {d.versions[a.id] !== undefined && <Pressable onPress={() => { const v = { ...d.versions }; delete v[a.id]; set({ versions: v }); }}><Text style={[s.link, { fontSize: 12.5, marginTop: 6 }]}>Reset to the rules version</Text></Pressable>}
          </View>
        );
      })}
      <View style={[s.card, s.row, { flexWrap: 'wrap' }]}>
        <Btn label={busy === 'publish' ? 'Publishing…' : 'Publish now'} icon="paper-plane-outline" disabled={!!busy} onPress={() => finish('publish')} />
        <Btn soft label="Schedule" icon="calendar-outline" disabled={!!busy} onPress={() => { const t = new Date(Date.now() + 3600000); setSched({ date: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`, time: `${String(t.getHours()).padStart(2, '0')}:00` }); }} />
        <Btn soft label="Add to queue" icon="time-outline" disabled={!!busy} onPress={() => finish('queue')} />
        <Pressable disabled={!!busy} onPress={() => finish('draft')} style={{ marginTop: 12, padding: 10 }}><Text style={s.link}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</Text></Pressable>
        {!!d.id && <Pressable onPress={() => setDraft(emptyDraft())} style={{ marginTop: 12, padding: 10 }}><Text style={[s.link, { color: '#5C6B7A' }]}>New post</Text></Pressable>}
      </View>
      <Text style={s.tiny}>Queue: Nexora posts at the next free time ({QUEUE_SLOTS.join(', ')}, your time). Accounts marked “you post” get a reminder and the text ready to share.</Text>
      <Sheet visible={!!sched} title="Schedule the post" onClose={() => setSched(null)}>
        {sched && <>
          <Text style={s.label}>Date (YYYY-MM-DD)</Text>
          <TextInput value={sched.date} onChangeText={t => setSched({ ...sched, date: t })} style={s.input} />
          <Text style={s.label}>Time (24-hour, HH:MM)</Text>
          <TextInput value={sched.time} onChangeText={t => setSched({ ...sched, time: t })} style={s.input} />
          <Btn label={busy === 'schedule' ? 'Scheduling…' : 'Schedule'} disabled={!!busy} onPress={() => {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sched.date.trim()), h = /^(\d{1,2}):(\d{2})$/.exec(sched.time.trim());
            if (!m || !h) { flash('Use the date like 2026-12-31 and the time like 14:30'); return; }
            const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2]));
            if (at.getTime() < Date.now() + 60000) { flash('Choose a time at least a minute from now'); return; }
            finish('schedule', at.toISOString());
          }} />
        </>}
      </Sheet>
    </>
  );
}

// ---------- Posts ----------
const FILTERS: { k: string; label: string; test: (p: SocialPost) => boolean }[] = [
  { k: 'all', label: 'All', test: p => p.status !== 'archived' }, { k: 'draft', label: 'Drafts', test: p => p.status === 'draft' },
  { k: 'scheduled', label: 'Scheduled', test: p => p.status === 'scheduled' }, { k: 'queued', label: 'Queue', test: p => p.status === 'queued' },
  { k: 'you', label: 'Post yourself', test: p => p.targets.some(t => t.status === 'needs_manual') }, { k: 'published', label: 'Published', test: p => p.status === 'published' || p.status === 'partly_published' },
  { k: 'failed', label: 'Failed', test: p => p.targets.some(t => t.status === 'failed') }, { k: 'archived', label: 'Archived', test: p => p.status === 'archived' },
];
function Posts({ posts, flash, reload, edit }: { posts: SocialPost[]; flash: (t: string) => void; reload: () => Promise<void>; edit: (d: Draft) => void }) {
  const [f, setF] = useState('all');
  const [hist, setHist] = useState<Target | null>(null);
  const [mark, setMark] = useState<{ t: Target; link: string } | null>(null);
  const [del, setDel] = useState<SocialPost | null>(null);
  const [busy, setBusy] = useState('');
  const shown = posts.filter(FILTERS.find(x => x.k === f)!.test);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => { setBusy(key); try { await fn(); flash(ok); await reload(); } catch (e) { flash((e as Error).message); } setBusy(''); };
  const small = (icon: string, label: string, onPress: () => void, disabled = false) => (
    <Pressable key={label} onPress={onPress} disabled={disabled} style={[s.small2, disabled && { opacity: 0.5 }]} accessibilityRole="button"><Ionicons name={icon as any} size={14} color="#1E56A0" /><Text style={s.small2Text}>{label}</Text></Pressable>
  );
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map(x => <Pressable key={x.k} onPress={() => setF(x.k)} style={[s.tab, f === x.k && s.tabOn]}><Text style={[s.tabText, f === x.k && { color: '#FFF' }]}>{x.label} ({posts.filter(x.test).length})</Text></Pressable>)}
      </ScrollView>
      {!shown.length ? <View style={s.card}><Text style={s.small}>Nothing here yet.</Text></View> : shown.map(p => (
        <View key={p.id} style={s.card}>
          <View style={s.row}><View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{p.title || 'Untitled post'}</Text>
            <Text style={s.tiny}>{p.scheduled_at && (p.status === 'scheduled' || p.status === 'queued') ? `${p.status === 'queued' ? 'Queued for' : 'Scheduled for'} ${when(p.scheduled_at)} · ` : ''}Updated {when(p.updated_at)}</Text></View><Pill s={POST_STATUS[p.status]} /></View>
          {p.targets.map(t => (
            <View key={t.id} style={s.targetRow}>
              <View style={s.row}>
                <PIcon k={t.platform} />
                <Text style={[s.small, { flex: 1, color: '#0B1220', fontWeight: '600' }]} numberOfLines={1}>{t.account_name}</Text>
                <Pill s={TARGET_STATUS[t.status]} />
                <Pressable onPress={() => setHist(t)} hitSlop={8} accessibilityLabel={`History for ${t.account_name}`}><Ionicons name="time-outline" size={18} color="#5C6B7A" /></Pressable>
              </View>
              {!!t.error && <Text style={{ fontSize: 12, color: '#B42318', marginTop: 4 }}>{t.error}</Text>}
              {!!t.permalink && <Pressable onPress={() => Linking.openURL(t.permalink).catch(() => {})}><Text style={[s.link, { fontSize: 12 }]} numberOfLines={1}>{t.permalink}</Text></Pressable>}
              {t.status === 'needs_manual' && (
                <View style={[s.row, { flexWrap: 'wrap', marginTop: 6 }]}>
                  {small('share-outline', 'Share to app', () => { Share.share({ message: t.body }).catch(() => {}); })}
                  {small('open-outline', `Open ${platform(t.platform).name}`, () => { Linking.openURL(OPEN_URL[t.platform]).catch(() => {}); })}
                  {small('checkmark-circle-outline', 'I posted it', () => setMark({ t, link: '' }))}
                  {small('remove-circle-outline', 'Skip', () => run(t.id, () => skipTarget(t), 'Skipped'))}
                </View>
              )}
              {t.status === 'failed' && <View style={[s.row, { marginTop: 6 }]}>{small('refresh-outline', busy === t.id ? 'Retrying…' : 'Retry', () => run(t.id, () => retryTarget(t.id).then(r => { if (r.targets[0]?.status === 'failed') throw new Error(r.targets[0].error); }), 'Done'), busy === t.id)}</View>}
            </View>
          ))}
          <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
            {p.status !== 'archived' && p.status !== 'published' && small('create-outline', 'Edit', () => edit(draftFromPost(p)))}
            {['draft', 'scheduled', 'queued', 'failed'].includes(p.status) && small('paper-plane-outline', busy === p.id ? 'Publishing…' : 'Publish now', () => run(p.id, () => publishNow(p.id), 'Sent for publishing'), busy === p.id)}
            {small('repeat-outline', 'Reuse', () => edit(reuse(p)))}
            {small('archive-outline', p.status === 'archived' ? 'Unarchive' : 'Archive', () => run(`a${p.id}`, () => setArchived(p, p.status !== 'archived'), p.status === 'archived' ? 'Back in drafts' : 'Archived'))}
            <Pressable onPress={() => setDel(p)} hitSlop={8} accessibilityLabel="Delete post" style={{ padding: 6 }}><Ionicons name="trash-outline" size={18} color="#8A97A6" /></Pressable>
          </View>
        </View>
      ))}
      <Sheet visible={!!hist} title={hist ? `History: ${hist.account_name}` : ''} onClose={() => setHist(null)}>
        {hist && <>
          {[...hist.history].reverse().map((h, i) => <Text key={i} style={[s.small, { marginTop: 6 }]}><Text style={s.tiny}>{when(h.at)}</Text> · {h.text}</Text>)}
          <Text style={[s.tiny, { marginTop: 10 }]}>Attempts: {hist.attempts}</Text>
          <View style={{ backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12, marginTop: 10 }}><Text style={s.body2}>{hist.body}</Text></View>
        </>}
      </Sheet>
      <Sheet visible={!!mark} title="You posted it" onClose={() => setMark(null)}>
        {mark && <>
          <Text style={s.small}>Nexora marks it as published on {mark.t.account_name}. Add the link to the post if you have it.</Text>
          <Text style={s.label}>Link to the post (optional)</Text>
          <TextInput value={mark.link} onChangeText={t => setMark({ ...mark, link: t })} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor="#A5AFBB" style={s.input} />
          <Btn label="Mark as published" onPress={() => { const m = mark; setMark(null); run(m.t.id, () => markPublished(m.t, m.link), 'Marked as published'); }} />
        </>}
      </Sheet>
      <Modal visible={!!del} transparent animationType="fade" onRequestClose={() => setDel(null)} statusBarTranslucent>
        <View style={s.overlay}><View style={[s.dialog, { alignItems: 'center' }]}>
          <Text style={s.cardTitle}>Delete “{del?.title || 'this post'}”?</Text>
          <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>It is removed from Nexora, including its history. Anything already on the platforms stays there.</Text>
          <Pressable onPress={async () => { const p = del!; setDel(null); await run(p.id, () => deletePost(p.id), 'Post deleted'); }} style={[s.primary, { backgroundColor: '#D64545', alignSelf: 'stretch' }]}><Text style={s.primaryText}>Delete post</Text></Pressable>
          <Pressable onPress={() => setDel(null)} style={{ padding: 12 }}><Text style={s.link}>Cancel</Text></Pressable>
        </View></View>
      </Modal>
    </>
  );
}

// ---------- Calendar ----------
function Calendar({ posts }: { posts: SocialPost[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [day, setDay] = useState<string | null>(null);
  const days = useMemo(() => { const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }); }, [month]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const items = posts.filter(p => p.status !== 'archived').flatMap(p => p.targets.map(t => ({ p, t, at: t.published_at || t.scheduled_at || p.scheduled_at }))).filter(x => x.at);
  const byDay = new Map<string, typeof items>();
  for (const x of items) { const k = key(new Date(x.at!)); byDay.set(k, [...(byDay.get(k) ?? []), x]); }
  const today = key(new Date());
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Pressable onPress={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} hitSlop={8} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color="#0B1220" /></Pressable>
        <Text style={[s.cardTitle, { flex: 1, textAlign: 'center' }]}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable onPress={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} hitSlop={8} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color="#0B1220" /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 10 }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} style={[s.tiny, { width: '14.28%', textAlign: 'center' }]}>{d}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {days.map(d => {
          const k = key(d), list = byDay.get(k) ?? [];
          return (
            <Pressable key={d.toISOString()} onPress={() => setDay(list.length ? k : null)} style={{ width: '14.28%', aspectRatio: 1, padding: 2 }}>
              <View style={{ flex: 1, borderRadius: 8, alignItems: 'center', paddingTop: 4, backgroundColor: day === k ? '#EAF1FB' : 'transparent', borderWidth: k === today ? 1.5 : 0, borderColor: '#1E56A0' }}>
                <Text style={{ fontSize: 12.5, color: d.getMonth() === month.getMonth() ? '#0B1220' : '#A5AFBB' }}>{d.getDate()}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>{list.slice(0, 3).map(x => <View key={x.t.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TARGET_STATUS[x.t.status].fg }} />)}</View>
              </View>
            </Pressable>
          );
        })}
      </View>
      {day && (byDay.get(day) ?? []).map(({ p, t }) => (
        <View key={t.id} style={[s.row, { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
          <PIcon k={t.platform} />
          <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{p.title || 'Post'}</Text><Text style={s.tiny}>{t.account_name} · {when(t.published_at || t.scheduled_at || p.scheduled_at)}</Text></View>
          <Pill s={TARGET_STATUS[t.status]} />
        </View>
      ))}
      <Text style={[s.tiny, { marginTop: 8 }]}>Tap a day with dots to see its posts. Dot colours follow each account's status.</Text>
    </View>
  );
}

// ---------- Accounts ----------
function Accounts({ accounts, caps, flash, reload }: { accounts: SocialAccount[]; caps: Caps | null; flash: (t: string) => void; reload: () => Promise<void> }) {
  const [add, setAdd] = useState<{ platform: PlatformKey; name: string; handle: string } | null>(null);
  const [ren, setRen] = useState<SocialAccount | null>(null);
  const [del, setDel] = useState<SocialAccount | null>(null);
  const meta = async () => { try { const u = await startMetaLogin(); Linking.openURL(u).catch(() => {}); flash('Approve access in Facebook, then come back and refresh.'); } catch (e) { flash((e as Error).message); } };
  return (
    <>
      <View style={s.card}>
        <Text style={s.cardTitle}>Your accounts</Text>
        <Text style={s.small}>Add as many as you use, including several on the same platform.</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Btn label="Connect Facebook & Instagram" icon="logo-facebook" onPress={meta} />
          <Btn soft label="Add an account" icon="add" onPress={() => setAdd({ platform: 'tiktok', name: '', handle: '' })} />
        </View>
        {caps && !caps.meta_ready && <View style={[s.warnBox, { marginTop: 12 }]}><Text style={{ flex: 1, color: '#8A5A00', fontSize: 12.5 }}>Facebook and Instagram login for publishing isn't switched on yet (the Nexora team needs to add the Meta app keys). Until then, add your Pages and accounts with “Add an account” and Nexora prepares each post for you to post.</Text></View>}
        {!accounts.length ? <View style={s.empty}><Text style={s.small}>No accounts yet.</Text></View> : accounts.map(a => (
          <View key={a.id} style={s.listRow}>
            <PIcon k={a.platform} size={24} />
            <View style={{ flex: 1 }}>
              <Text style={s.bold} numberOfLines={1}>{a.name} <Text style={s.small}>{a.handle}</Text></Text>
              <Text style={s.tiny}>{platform(a.platform).name} · {a.mode === 'api' ? 'Nexora posts for you' : 'You post (Nexora prepares it)'}</Text>
              {a.status === 'needs_reauth' && <Text style={{ fontSize: 12, color: '#B42318' }}>{a.status_note || 'Reconnect this account to keep publishing.'}</Text>}
            </View>
            <Pill s={a.status === 'connected' ? { t: 'Connected', bg: '#E6F4ED', fg: '#1E9E6D' } : a.status === 'needs_reauth' ? { t: 'Reconnect', bg: '#FDECEC', fg: '#B42318' } : { t: 'Off', bg: '#F2F4F7', fg: '#5C6B7A' }} />
            {a.mode === 'api' && a.status !== 'connected' && <Pressable onPress={meta}><Text style={[s.link, { fontSize: 12 }]}>Reconnect</Text></Pressable>}
            <Pressable onPress={() => setRen(a)} hitSlop={8} accessibilityLabel={`Rename ${a.name}`}><Ionicons name="create-outline" size={18} color="#5C6B7A" /></Pressable>
            <Pressable onPress={() => setDel(a)} hitSlop={8} accessibilityLabel={`Remove ${a.name}`}><Ionicons name="trash-outline" size={18} color="#8A97A6" /></Pressable>
          </View>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>What Nexora can do on each platform</Text>
        {PLATFORMS.map(p => (
          <View key={p.key} style={[s.row, { alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
            <PIcon k={p.key} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{p.name} · <Text style={{ color: p.api ? '#1E9E6D' : '#B7791F', fontWeight: '600' }}>{p.api ? 'Nexora posts for you' : 'You post; Nexora prepares it'}</Text></Text>
              <Text style={s.small}>{caps?.caps?.[p.key]?.note ?? p.tip}</Text>
            </View>
          </View>
        ))}
      </View>
      <Sheet visible={!!add} title="Add an account" onClose={() => setAdd(null)}>
        {add && <>
          <Text style={s.label}>Platform</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>{PLATFORMS.map(p => <Pressable key={p.key} onPress={() => setAdd({ ...add, platform: p.key })} style={[s.pick, add.platform === p.key && s.pickOn]}><PIcon k={p.key} size={14} /><Text style={s.pickText}>{p.name}</Text></Pressable>)}</View>
          <Text style={s.label}>Name</Text>
          <TextInput value={add.name} onChangeText={t => setAdd({ ...add, name: t })} maxLength={120} placeholder="e.g. Jekamix Gadgets" placeholderTextColor="#A5AFBB" style={s.input} />
          <Text style={s.label}>Handle (optional)</Text>
          <TextInput value={add.handle} onChangeText={t => setAdd({ ...add, handle: t })} maxLength={120} autoCapitalize="none" placeholder="@yourhandle" placeholderTextColor="#A5AFBB" style={s.input} />
          <Text style={[s.tiny, { marginTop: 8 }]}>{platform(add.platform).api ? 'For Nexora to post on Facebook or Instagram for you, use “Connect Facebook & Instagram” instead. Added here, you post it yourself.' : 'Nexora prepares each post for this account and reminds you to post it.'}</Text>
          <Btn label="Add account" disabled={!add.name.trim()} onPress={async () => { try { await addManualAccount(add); setAdd(null); flash('Account added'); await reload(); } catch (e) { flash((e as Error).message); } }} />
        </>}
      </Sheet>
      <Sheet visible={!!ren} title="Rename account" onClose={() => setRen(null)}>
        {ren && <>
          <Text style={s.label}>Name</Text>
          <TextInput value={ren.name} onChangeText={t => setRen({ ...ren, name: t })} maxLength={120} style={s.input} />
          <Text style={s.label}>Handle</Text>
          <TextInput value={ren.handle} onChangeText={t => setRen({ ...ren, handle: t })} maxLength={120} autoCapitalize="none" style={s.input} />
          <Btn label="Save" disabled={!ren.name.trim()} onPress={async () => { try { await renameAccount(ren.id, ren.name, ren.handle); setRen(null); flash('Saved'); await reload(); } catch (e) { flash((e as Error).message); } }} />
        </>}
      </Sheet>
      <Modal visible={!!del} transparent animationType="fade" onRequestClose={() => setDel(null)} statusBarTranslucent>
        <View style={s.overlay}><View style={[s.dialog, { alignItems: 'center' }]}>
          <Text style={s.cardTitle}>Remove {del?.name}?</Text>
          <Text style={[s.small, { textAlign: 'center', marginTop: 4 }]}>Nexora stops posting to it. Posts already published stay on the platform and in your history.</Text>
          <Pressable onPress={async () => { const a = del!; setDel(null); try { await removeAccount(a.id); flash('Account removed'); await reload(); } catch (e) { flash((e as Error).message); } }} style={[s.primary, { backgroundColor: '#D64545', alignSelf: 'stretch' }]}><Text style={s.primaryText}>Remove account</Text></Pressable>
          <Pressable onPress={() => setDel(null)} style={{ padding: 12 }}><Text style={s.link}>Cancel</Text></Pressable>
        </View></View>
      </Modal>
    </>
  );
}

// ---------- Performance ----------
function Performance({ posts, flash, reload }: { posts: SocialPost[]; flash: (t: string) => void; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ t: Target; m: Record<string, string> } | null>(null);
  const keys = ['likes', 'comments', 'shares', 'reach', 'impressions', 'clicks'];
  const published = posts.flatMap(p => p.targets.filter(t => t.status === 'published').map(t => ({ p, t }))).sort((a, b) => (b.t.published_at ?? '').localeCompare(a.t.published_at ?? ''));
  const tot = totals(posts);
  return (
    <>
      <View style={s.card}>
        <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>How your posts did</Text>
          <Btn soft label={busy ? 'Updating…' : 'Update'} icon="refresh-outline" disabled={busy} onPress={async () => { setBusy(true); try { await refreshMetrics(); await reload(); flash('Updated from the platforms'); } catch (e) { flash((e as Error).message); } setBusy(false); }} /></View>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>
          <View style={s.stat}><Text style={s.tiny}>Published</Text><Text style={s.statNum}>{published.length}</Text></View>
          {keys.map(k => <View key={k} style={s.stat}><Text style={s.tiny}>{METRIC_LABEL[k]}</Text><Text style={s.statNum}>{(tot[k] ?? 0).toLocaleString()}</Text></View>)}
        </View>
        <Text style={[s.tiny, { marginTop: 8 }]}>Facebook and Instagram numbers come from the platforms. For other platforms, copy the numbers from the app's own insights.</Text>
      </View>
      {!published.length ? <View style={s.card}><Text style={s.small}>Nothing published yet.</Text></View> : published.map(({ p, t }) => (
        <View key={t.id} style={s.card}>
          <View style={s.row}><PIcon k={t.platform} /><View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{p.title || 'Post'}</Text><Text style={s.tiny}>{t.account_name} · {when(t.published_at)}</Text></View>
            {!!t.permalink && <Pressable onPress={() => Linking.openURL(t.permalink).catch(() => {})} hitSlop={8} accessibilityLabel="Open the post"><Ionicons name="open-outline" size={18} color="#5C6B7A" /></Pressable>}</View>
          <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>{keys.map(k => <Text key={k} style={s.small}>{METRIC_LABEL[k]}: <Text style={s.bold}>{typeof t.metrics[k] === 'number' ? (t.metrics[k] as number).toLocaleString() : '–'}</Text></Text>)}</View>
          {t.metrics.source !== 'platform' && <Pressable onPress={() => setEdit({ t, m: Object.fromEntries(keys.map(k => [k, typeof t.metrics[k] === 'number' ? String(t.metrics[k]) : ''])) })}><Text style={[s.link, { fontSize: 12.5, marginTop: 6 }]}>Add numbers</Text></Pressable>}
        </View>
      ))}
      <Sheet visible={!!edit} title={edit ? `Numbers for ${edit.t.account_name}` : ''} onClose={() => setEdit(null)}>
        {edit && <>
          <Text style={s.small}>{platform(edit.t.platform).name} doesn't share these with Nexora. Copy them from the post's insights in the app.</Text>
          {keys.map(k => <View key={k}><Text style={s.label}>{METRIC_LABEL[k]}</Text><TextInput value={edit.m[k]} onChangeText={v => setEdit({ ...edit, m: { ...edit.m, [k]: v.replace(/\D/g, '') } })} keyboardType="number-pad" style={s.input} /></View>)}
          <Btn label="Save numbers" onPress={async () => { try { await saveManualMetrics(edit.t, Object.fromEntries(Object.entries(edit.m).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))); setEdit(null); flash('Saved'); await reload(); } catch (e) { flash((e as Error).message); } }} />
        </>}
      </Sheet>
    </>
  );
}

// ---------- Building blocks ----------
function Btn({ label, icon, onPress, disabled, soft }: { label: string; icon?: string; onPress: () => void; disabled?: boolean; soft?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.primary, soft && { backgroundColor: '#EAF1FB' }, disabled && { opacity: 0.5 }]}>
      {icon && <Ionicons name={icon as any} size={16} color={soft ? '#1E56A0' : '#FFF'} />}<Text style={[s.primaryText, soft && { color: '#1E56A0' }]}>{label}</Text>
    </Pressable>
  );
}
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}><View style={s.dialog}>
        <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>{title}</Text><Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View></View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E6ECF3' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#0B1220' },
  body: { padding: 16, paddingTop: 4, paddingBottom: 48, gap: 12 },
  wide: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8F0' },
  tabOn: { backgroundColor: '#0F2942', borderColor: '#0F2942' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#1F2A37' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECF3', padding: 16, width: '100%' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0B1220' },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11.5, color: '#8A97A6' },
  body2: { fontSize: 13.5, lineHeight: 20, color: '#1F2A37' },
  link: { fontSize: 14, fontWeight: '700', color: '#1E56A0' },
  label: { marginTop: 12, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  thumb: { width: 72, height: 72, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', backgroundColor: '#F4F7FB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: '#E1E8F0', backgroundColor: '#FFF' },
  pickOn: { borderColor: '#1E56A0', backgroundColor: '#EAF1FB' },
  pickText: { fontSize: 12.5, fontWeight: '600', color: '#1F2A37' },
  primary: { marginTop: 12, height: 44, borderRadius: 22, backgroundColor: '#1E56A0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  primaryText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  small2: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: '#E1E8F0' },
  small2Text: { fontSize: 12, fontWeight: '600', color: '#1E56A0' },
  targetRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 6 },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDF3E1', borderRadius: 12, padding: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  empty: { marginTop: 12, backgroundColor: '#F4F7FB', borderRadius: 12, padding: 12 },
  stat: { flexBasis: '30%', flexGrow: 1, backgroundColor: '#F7F9FC', borderRadius: 12, padding: 10 },
  statNum: { fontSize: 20, fontWeight: '700', color: '#0B1220', marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'center', padding: 16 },
  dialog: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '90%' },
});
