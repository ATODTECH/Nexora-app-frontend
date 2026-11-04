import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { AutopilotCard, ChartCard, ChoiceChip } from './AutopilotCard';
import {
  CHANNELS, KINDS, addTouch, loadResearch, channelLabel, copyB, createCampaign, deleteCampaign, deleteTouch, emptyBrief, fillCopy, generatePlan, loadAdvice, loadCampaigns, loadContext,
  loadResults, loadTouches, sendTouch, setCampaignStatus, touchLink, touchToSocial, updateTouch,
  type Advice, type BestTime, type Brief, type Campaign, type Context, type Plan, type Research, type Result, type Touch,
} from '../lib/aiMarketing';

// AI Marketing and Campaign Management (blueprint 2.5), the app's screen. Same data and rules as the website's /marketing.
const TITLE = 'AI Marketing and Campaign Management';
type Tab = 'studio' | 'campaigns' | 'calendar' | 'audiences' | 'results' | 'advice' | 'autopilot';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'studio', label: 'AI Studio', icon: 'sparkles-outline' }, { k: 'campaigns', label: 'Campaigns', icon: 'list-outline' }, { k: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { k: 'audiences', label: 'Audiences', icon: 'people-outline' }, { k: 'results', label: 'Results', icon: 'bar-chart-outline' }, { k: 'advice', label: 'Advice', icon: 'bulb-outline' },
  { k: 'autopilot', label: 'Autopilot', icon: 'rocket-outline' },
];
const STATUS: Record<string, [string, string]> = { draft: ['#F2F4F7', '#5C6B7A'], scheduled: ['#EEF4FC', '#1E56A0'], active: ['#E6F4ED', '#1E9E6D'], ended: ['#F2F4F7', '#8A97A6'], planned: ['#F2F4F7', '#5C6B7A'], sent: ['#E6F4ED', '#1E9E6D'], shared: ['#E6F4ED', '#1E9E6D'], done: ['#E6F4ED', '#1E9E6D'], skipped: ['#F2F4F7', '#8A97A6'] };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const money = (v: number, cur: string) => { const n = Math.round(v || 0); const t = Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : n.toLocaleString(); return cur ? `${cur} ${t}` : t; };
const Pill = ({ t }: { t: string }) => { const [bg, fg] = STATUS[t] ?? STATUS.draft; return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: '700', color: fg, textTransform: 'capitalize' }}>{t}</Text></View>; };
const Kpis = ({ items }: { items: [string, string][] }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{items.map(([l, v]) => <View key={l} style={s.kpi}><Text style={s.small}>{l}</Text><Text style={{ fontSize: 20, fontWeight: '900', color: '#0B1220' }}>{v}</Text></View>)}</View>;
const Btn = ({ label, icon, onPress, soft, disabled, busy }: { label: string; icon?: string; onPress: () => void; soft?: boolean; disabled?: boolean; busy?: boolean }) => (
  <Pressable disabled={disabled || busy} onPress={onPress} style={[s.btn, soft && s.btnSoft, (disabled || busy) && { opacity: 0.5 }]}>
    {busy ? <ActivityIndicator color={soft ? '#1E56A0' : '#FFF'} /> : icon ? <Ionicons name={icon as any} size={16} color={soft ? '#1E56A0' : '#FFF'} /> : null}
    <Text style={[s.btnText, soft && { color: '#1E56A0' }]}>{label}</Text>
  </Pressable>
);

export function AIMarketing({ onBack, flash, goTo, topInset = 0, wide = false }: { onBack: () => void; flash: (t: string) => void; goTo?: (href: string) => void; topInset?: number; wide?: boolean }) {
  const [tab, setTab] = useState<Tab>('studio');
  const [ctx, setCtx] = useState<Context | null>(null);
  const [camps, setCamps] = useState<Campaign[] | null>(null);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [results, setResults] = useState<{ campaigns: Result[]; currency: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [studioKind, setStudioKind] = useState<Brief['kind']>('promotion');
  const reload = useCallback(async () => {
    try { const [c, t] = await Promise.all([loadCampaigns(), loadTouches()]); setCamps(c); setTouches(t); } catch (e) { flash((e as Error).message); setCamps(x => x ?? []); }
    loadResults().then(setResults, () => {});
  }, [flash]);
  useEffect(() => {
    let live = true;
    Promise.all([loadCampaigns(), loadTouches()]).then(([c, t]) => { if (live) { setCamps(c); setTouches(t); } }, e => { if (live) { flash((e as Error).message); setCamps([]); } });
    loadContext().then(c => { if (live) setCtx(c); }, e => { if (live) flash((e as Error).message); });
    loadResults().then(r => { if (live) setResults(r); }, () => {});
    return () => { live = false; };
  }, [flash]);
  const cur = results?.currency || ctx?.business.currency || '';
  const openCampaign = (id: string) => { setOpen(id); setTab('campaigns'); };
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F6F8', paddingTop: topInset }}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color="#0B1220" /></Pressable>
        <Text style={s.title} numberOfLines={2}>{TITLE}</Text>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {TABS.map(t => <Pressable key={t.k} onPress={() => setTab(t.k)} style={[s.tab, tab === t.k && s.tabOn]}><Ionicons name={t.icon as any} size={15} color={tab === t.k ? '#FFF' : '#26313D'} /><Text style={[s.tabText, tab === t.k && { color: '#FFF' }]}>{t.label}</Text></Pressable>)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 60, gap: 12 }, wide && { width: '100%', maxWidth: 1100, alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        {camps === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 40 }} /> : <>
          {tab === 'studio' && <Studio key={studioKind} ctx={ctx} kind={studioKind} flash={flash} onSaved={async id => { await reload(); openCampaign(id); }} />}
          {tab === 'campaigns' && (open && camps.some(c => c.id === open)
            ? <Detail c={camps.find(c => c.id === open)!} touches={touches.filter(t => t.campaign_id === open)} result={results?.campaigns.find(r => r.id === open) ?? null} cur={cur} back={() => setOpen(null)} flash={flash} reload={reload} />
            : <List camps={camps} touches={touches} results={results?.campaigns ?? []} cur={cur} onOpen={setOpen} newOne={() => setTab('studio')} />)}
          {tab === 'calendar' && <Agenda touches={touches} camps={camps} onOpen={openCampaign} />}
          {tab === 'audiences' && <Audiences ctx={ctx} plan={k => { setStudioKind(k === 'inactive' ? 'reengage' : 'promotion'); setTab('studio'); }} />}
          {tab === 'results' && <Results results={results} cur={cur} onOpen={openCampaign} />}
          {tab === 'advice' && <AdviceTab flash={flash} goTo={goTo} />}
          {tab === 'autopilot' && <AutopilotCard job="campaign_review" flash={flash} goTo={goTo} />}
        </>}
      </ScrollView>
    </View>
  );
}

const Thumb = ({ src, size = 56 }: { src?: string | null; size?: number }) => (src ? <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#F2F4F7' }} /> : null);
// What is happening outside Nexora: holidays and shopping days, Google search trends, competitor offers, news, best time.
function OnlineNow({ r, bt, onDate, title = 'What’s happening online' }: { r: Research | null; bt: BestTime | null; onDate?: (d: Research['dates'][number]) => void; title?: string }) {
  const { width } = useWindowDimensions();
  if (!r) return <View style={[s.card, s.row, { gap: 8 }]}><ActivityIndicator color="#1E56A0" /><Text style={s.small}>Checking holidays, Google search trends and news…</Text></View>;
  return (
    <View style={[s.card, { gap: 10 }]}>
      <View style={[s.row, { gap: 6 }]}><Ionicons name="globe-outline" size={18} color="#1E56A0" /><Text style={[s.h, { flex: 1, marginBottom: 0 }]}>{title}</Text><Text style={s.tiny}>{r.country} · live</Text></View>
      {!!r.dates.length && <>
        <Text style={s.label}>Coming up (plan 1–2 weeks ahead)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{r.dates.slice(0, 8).map(d => (
          <Pressable key={d.date + d.name} disabled={!onDate} onPress={() => onDate?.(d)} style={{ width: 118, borderRadius: 12, borderWidth: 1, borderColor: d.kind === 'shopping' ? '#BFD3EE' : '#E3E8EF', backgroundColor: d.kind === 'shopping' ? '#EEF4FC' : '#FFF', padding: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#1E56A0' }}>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
            <Text style={[s.bold, { fontSize: 12.5 }]} numberOfLines={2}>{d.name}</Text><Text style={s.tiny}>{d.days === 0 ? 'today' : `in ${d.days} days`}</Text>
          </Pressable>
        ))}</ScrollView>
      </>}
      {!!r.trends.length && <>
        <Text style={s.label}>Searched most today (Google Trends)</Text>
        <View style={s.wrap}>{r.trends.slice(0, 10).map(t => (
          <Pressable key={t.term} onPress={() => Linking.openURL(t.url).catch(() => {})} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: t.relevant ? '#E6F4ED' : '#F2F4F7' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.relevant ? '#1E9E6D' : '#26313D' }}>{t.term}{t.traffic ? ` · ${t.traffic}` : ''}</Text>
          </Pressable>
        ))}</View>
      </>}
      {!!r.competitors.length && <><Text style={s.label}>What others are offering now (web search)</Text>{r.competitors.map(c => <Text key={c} style={s.small}>• {c}</Text>)}</>}
      {!!r.news.length && <><Text style={s.label}>Market news</Text>{r.news.slice(0, 3).map(n => <Pressable key={n.url} onPress={() => Linking.openURL(n.url).catch(() => {})}><Text style={[s.link, { fontSize: 12.5 }]} numberOfLines={2}>{n.title}</Text></Pressable>)}</>}
      {bt?.enough && <ChartCard w={Math.min(width, 1100) - 60} cur="" c={{ type: 'heatmap', title: `Best time to reach customers: ${bt.label}`, rows: bt.rows, cols: bt.cols, grid: bt.grid }} />}
    </View>
  );
}

function Studio({ ctx, kind, flash, onSaved }: { ctx: Context | null; kind: Brief['kind']; flash: (t: string) => void; onSaved: (id: string) => Promise<void> }) {
  const [b, setB] = useState<Brief>(() => emptyBrief(kind));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<'' | 'gen' | 'save'>('');
  const [web, setWeb] = useState<{ research: Research; best_time: BestTime } | null>(null);
  useEffect(() => { let live = true; loadResearch().then(r => { if (live) setWeb(r); }, () => {}); return () => { live = false; }; }, []);
  const set = (p: Partial<Brief>) => setB({ ...b, ...p });
  const planFor = (d: Research['dates'][number]) => {
    const dayAt = new Date(`${d.date}T12:00:00`), start = new Date(Math.max(Date.now(), dayAt.getTime() - 10 * 86400000));
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    setB({ ...b, kind: 'event', goal: `${d.name} campaign`, start: iso(start), end: iso(dayAt) });
    flash(`Set up for ${d.name}`);
  };
  const toggle = (k: 'channels' | 'products', v: string) => set({ [k]: b[k].includes(v) ? b[k].filter(x => x !== v) : [...b[k], v] } as Partial<Brief>);
  const gen = async () => {
    if (!b.channels.length) { flash('Choose at least one channel'); return; }
    setBusy('gen'); setPlan(null);
    try { setPlan(await generatePlan(b)); } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const save = async (launch: boolean) => {
    if (!plan) return; setBusy('save');
    try { const c = await createCampaign(plan, b, launch); flash(launch ? 'Campaign saved and launched' : 'Campaign saved as a draft'); await onSaved(c.id); } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const pickable = [...new Set([...(ctx?.best_sellers ?? []).map(x => x.name), ...(ctx?.products ?? []).map(p => p.name)])].slice(0, 12);
  const setStep = (i: number, copy_a: string) => plan && setPlan({ ...plan, steps: plan.steps.map((x, j) => (j === i ? { ...x, copy_a } : x)) });
  return (
    <>
      <View style={s.card}>
        <Text style={s.h}>What do you want to achieve?</Text>
        <View style={s.wrap}>{KINDS.map(k => <ChoiceChip key={k.k} on={b.kind === k.k} label={k.label} onPress={() => set({ kind: k.k, audience: k.k === 'reengage' ? 'inactive' : b.audience })} />)}</View>
        <Text style={s.tiny}>{KINDS.find(k => k.k === b.kind)?.hint}</Text>
        <Text style={s.label}>Goal in your words (optional)</Text>
        <TextInput value={b.goal} onChangeText={v => set({ goal: v })} maxLength={300} placeholder="e.g. Sell 50 power banks before Christmas" style={s.input} />
        {!!pickable.length && <><Text style={s.label}>Products to feature</Text><View style={s.wrap}>{pickable.map(p => <ChoiceChip key={p} on={b.products.includes(p)} label={p} onPress={() => toggle('products', p)} />)}</View></>}
        <Text style={s.label}>Channels</Text>
        <View style={s.wrap}>{CHANNELS.map(c => <ChoiceChip key={c.k} on={b.channels.includes(c.k)} label={c.label} onPress={() => toggle('channels', c.k)} />)}</View>
        <Text style={s.label}>Audience</Text>
        <View style={s.wrap}>{(ctx?.audiences.list ?? [{ key: 'all', label: 'Everyone in Customers', count: 0 }]).map(a => <ChoiceChip key={a.key} on={b.audience === a.key} label={`${a.label} (${a.count})`} onPress={() => set({ audience: a.key })} />)}</View>
        <Text style={s.label}>Offer</Text>
        <View style={s.wrap}>{([['auto', 'Let Nexora suggest'], ['percent', '% off'], ['amount', 'Amount off'], ['free_delivery', 'Free delivery'], ['bundle', 'Bundle'], ['none', 'No discount']] as const).map(([k, l]) => <ChoiceChip key={k} on={b.offer === k} label={l} onPress={() => set({ offer: k })} />)}</View>
        {(b.offer === 'percent' || b.offer === 'amount') && <TextInput value={b.offer_value} onChangeText={v => set({ offer_value: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder={b.offer === 'percent' ? 'Percent off' : 'Amount off'} style={[s.input, { marginTop: 8 }]} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={s.label}>Starts (YYYY-MM-DD)</Text><TextInput value={b.start} onChangeText={v => set({ start: v })} style={s.input} /></View>
          <View style={{ flex: 1 }}><Text style={s.label}>Ends</Text><TextInput value={b.end} onChangeText={v => set({ end: v })} style={s.input} /></View>
        </View>
        <Text style={s.label}>Budget (optional)</Text>
        <TextInput value={b.budget} onChangeText={v => set({ budget: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Used to work out cost per order" style={s.input} />
        <Text style={s.label}>Anything else (optional)</Text>
        <TextInput value={b.notes} onChangeText={v => set({ notes: v })} maxLength={400} multiline placeholder="e.g. We deliver free in Lagos; tone: fun" style={[s.input, { minHeight: 64, paddingTop: 10 }]} />
        <View style={{ marginTop: 14 }}><Btn label={busy === 'gen' ? 'Nexora is planning…' : 'Create campaign plan'} icon="sparkles" onPress={gen} busy={busy === 'gen'} /></View>
        <Text style={[s.tiny, { marginTop: 6 }]}>Nexora uses your real products, prices, best sellers and past results, and never invents prices or claims.</Text>
      </View>
      {!plan && <OnlineNow r={web?.research ?? null} bt={web?.best_time ?? null} onDate={planFor} />}
      {plan && <>
        {!!plan.note && <View style={[s.card, { backgroundColor: '#FDF3E1', borderColor: '#F5DFB5' }]}><Text style={[s.small, { color: '#8A5A12' }]}>{plan.note}</Text></View>}
        {plan.ideas.map((x, i) => (
          <Pressable key={i} onPress={() => setPlan({ ...plan, name: x.name })} style={[s.card, plan.name === x.name && { borderColor: '#1E56A0', backgroundColor: '#EEF4FC' }]}>
            <Text style={s.bold}>{x.name}</Text><Text style={s.small}>{x.angle}</Text><Text style={s.tiny}>{x.why}</Text>
          </Pressable>
        ))}
        <View style={s.card}>
          <TextInput value={plan.name} onChangeText={v => setPlan({ ...plan, name: v })} style={{ fontSize: 18, fontWeight: '800', color: '#0B1220' }} />
          <Text style={[s.small, { marginTop: 4 }]}>{plan.summary}</Text>
          <Kpis items={[['Offer', plan.offer.text || 'No discount'], ...(plan.offer.code ? [['Code', plan.offer.code] as [string, string]] : []), ['Call to action', plan.cta]]} />
          {!!plan.audience_note && <Text style={[s.tiny, { marginTop: 6 }]}>{plan.audience_note}</Text>}
        </View>
        <View style={s.card}>
          <Text style={s.h}>Timeline ({plan.steps.length} touches)</Text>
          {plan.steps.map((x, i) => (
            <View key={i} style={{ marginTop: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF1F4', paddingTop: i ? 10 : 0 }}>
              <Text style={s.bold}>Day {x.day + 1} · {channelLabel(x.channel)}</Text><Text style={s.tiny}>{x.title}</Text>
              <View style={[s.row, { gap: 8, marginTop: 6, alignItems: 'flex-start' }]}><Thumb src={x.image} size={64} /><TextInput value={x.copy_a} onChangeText={v => setStep(i, v)} multiline style={[s.input, { flex: 1, minHeight: 80, paddingTop: 10, fontSize: 13 }]} /></View>
              {!!x.copy_b && x.copy_b !== x.copy_a && <Pressable onPress={() => setPlan({ ...plan, steps: plan.steps.map((y, j) => (j === i ? { ...y, copy_a: y.copy_b, copy_b: y.copy_a } : y)) })}><Text style={[s.link, { marginTop: 4 }]}>Use copy B instead</Text></Pressable>}
            </View>
          ))}
          <Text style={[s.tiny, { marginTop: 8 }]}>{'{link}'} becomes each touch’s own tracked link; {'{name}'} the customer’s first name.</Text>
        </View>
        {plan.research && <OnlineNow r={plan.research} bt={plan.best_time ?? null} title="What Nexora used from online" />}
        {!!plan.research?.sources.length && <View style={s.card}><Text style={s.h}>Sources</Text>{plan.research.sources.map(x => <Pressable key={x.url} onPress={() => Linking.openURL(x.url).catch(() => {})}><Text style={[s.link, { fontSize: 12 }]} numberOfLines={1}>{x.title}</Text></Pressable>)}</View>}
        {!!plan.tips.length && <View style={s.card}><Text style={s.h}>Tips</Text>{plan.tips.map(t => <Text key={t} style={[s.small, { marginTop: 4 }]}>• {t}</Text>)}</View>}
        <View style={{ gap: 8 }}>
          <Btn label={busy === 'save' ? 'Saving…' : 'Save and launch'} icon="rocket-outline" onPress={() => save(true)} busy={busy === 'save'} />
          <Btn label="Save as draft" soft onPress={() => save(false)} disabled={!!busy} />
          <Btn label="Try again" soft onPress={gen} disabled={!!busy} />
        </View>
      </>}
    </>
  );
}

function List({ camps, touches, results, cur, onOpen, newOne }: { camps: Campaign[]; touches: Touch[]; results: Result[]; cur: string; onOpen: (id: string) => void; newOne: () => void }) {
  return (
    <>
      <Btn label="New campaign with AI" icon="add" onPress={newOne} />
      {!camps.length ? <View style={s.card}><Text style={s.small}>No campaigns yet. Create one in the AI Studio.</Text></View> : camps.map(c => {
        const r = results.find(x => x.id === c.id); const n = touches.filter(t => t.campaign_id === c.id).length;
        return (
          <Pressable key={c.id} onPress={() => onOpen(c.id)} style={s.card}>
            <View style={[s.row, { gap: 8 }]}><Text style={[s.bold, { flex: 1 }]} numberOfLines={1}>{c.name}</Text><Pill t={c.status} /><Ionicons name="chevron-forward" size={16} color="#8A97A6" /></View>
            <Text style={s.tiny}>{KINDS.find(k => k.k === c.kind)?.label ?? 'Campaign'} · {day(c.starts_at)} – {day(c.ends_at)} · {n} touch{n === 1 ? '' : 'es'}{c.coupon_code ? ` · code ${c.coupon_code}` : ''}</Text>
            {r && <Text style={[s.small, { marginTop: 4 }]}>{r.totals.visits} visits · {r.totals.orders} orders · {money(r.totals.sales, cur)}</Text>}
          </Pressable>
        );
      })}
    </>
  );
}

function Detail({ c, touches, result, cur, back, flash, reload }: { c: Campaign; touches: Touch[]; result: Result | null; cur: string; back: () => void; flash: (t: string) => void; reload: () => Promise<void> }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 1100) - 60;
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<Touch | null>(null);
  const [people, setPeople] = useState<{ t: Touch; list: { id: string; name: string; phone: string; link: string }[] } | null>(null);
  const [adding, setAdding] = useState<{ channel: string; body: string } | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => { setBusy(key); try { await fn(); if (ok) flash(ok); await reload(); } catch (e) { flash((e as Error).message); } setBusy(''); };
  const shareCopy = async (t: Touch) => { try { const link = await touchLink(t.src); await Share.share({ message: fillCopy(t.body, link) }); } catch (e) { flash((e as Error).message); } };
  const del = () => Alert.alert(`Delete “${c.name}”?`, 'Its touches and plan are deleted. Orders and visits already recorded stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run('del', async () => { await deleteCampaign(c.id); back(); }, 'Campaign deleted') }]);
  const tot = result?.totals;
  return (
    <>
      <Pressable onPress={back} style={s.row}><Ionicons name="chevron-back" size={16} color="#1E56A0" /><Text style={s.link}>All campaigns</Text></Pressable>
      <View style={s.card}>
        <View style={[s.row, { gap: 8 }]}><Text style={[s.h, { flex: 1 }]}>{c.name}</Text><Pill t={c.status} /></View>
        <Text style={s.tiny}>{KINDS.find(k => k.k === c.kind)?.label} · {day(c.starts_at)} – {day(c.ends_at)}{c.coupon_code ? ` · code ${c.coupon_code}` : ''}{c.budget ? ` · budget ${money(c.budget, cur)}` : ''}</Text>
        {!!c.plan?.summary && <Text style={[s.small, { marginTop: 4 }]}>{c.plan.summary}</Text>}
        {!!c.plan?.best_time && <Text style={[s.tiny, { marginTop: 4 }]}>Sends around: {c.plan.best_time}</Text>}
        {!!c.plan?.online?.sources?.length && <Text style={[s.tiny, { marginTop: 2 }]}>Online sources used: {c.plan.online.sources.length}</Text>}
        <View style={[s.wrap, { marginTop: 10 }]}>
          {c.status === 'draft' && <Btn label="Launch" icon="rocket-outline" onPress={() => run('st', () => setCampaignStatus(c.id, 'active'), 'Campaign launched')} busy={busy === 'st'} />}
          {(c.status === 'active' || c.status === 'scheduled') && <Btn label="End campaign" soft onPress={() => run('st', () => setCampaignStatus(c.id, 'ended'), 'Campaign ended')} busy={busy === 'st'} />}
          <Btn label="Add a touch" icon="add" soft onPress={() => setAdding({ channel: 'instagram', body: '' })} />
          <Pressable onPress={del} style={{ justifyContent: 'center', paddingHorizontal: 8 }}><Text style={[s.small, { color: '#B42318' }]}>Delete</Text></Pressable>
        </View>
      </View>
      {tot && <>
        <Kpis items={[['Tracked visits', String(tot.visits)], ['Enquiries', String(tot.enquiries + tot.chats)], ['Orders', String(tot.orders)], ['Sales', money(tot.sales, cur)], ['Visit → order', tot.conversion === null ? '—' : `${tot.conversion}%`], ...(tot.cost_per_order !== null ? [['Cost per order', money(tot.cost_per_order, cur)] as [string, string]] : [])]} />
        {result!.channels.length > 0 && <ChartCard w={w} cur={cur} c={{ type: 'bar', title: 'Visits by channel', unit: 'count', items: result!.channels.map(x => ({ label: channelLabel(x.channel), value: x.visits })) }} />}
        {result!.channels.length > 0 && <ChartCard w={w} cur={cur} c={{ type: 'funnel', title: 'From reach to orders', steps: [...(tot.sent ? [{ label: 'Messages sent', value: tot.sent }] : []), { label: 'Visits', value: tot.visits }, { label: 'Enquiries', value: tot.enquiries + tot.chats }, { label: 'Orders', value: tot.orders }] }} />}
        {!tot.visits && !tot.orders && <View style={s.card}><Text style={s.small}>No tracked results yet. Only visits and orders from this campaign’s own links or code are counted, so nothing is guessed.</Text></View>}
      </>}
      <Text style={s.h}>Touches ({touches.length})</Text>
      {touches.map(t => {
        const ch = CHANNELS.find(x => x.k === t.channel);
        return (
          <View key={t.id} style={s.card}>
            <View style={[s.row, { gap: 8 }]}><Text style={[s.link, { fontSize: 12 }]}>{day(t.scheduled_at)}</Text><Text style={[s.bold, { flex: 1 }]} numberOfLines={1}>{channelLabel(t.channel)} · {t.title}</Text><Pill t={t.status} /></View>
            <View style={[s.row, { gap: 8, marginTop: 6, alignItems: 'flex-start' }]}><Thumb src={t.image} /><Text style={[s.small, { flex: 1 }]} numberOfLines={5}>{t.body}</Text></View>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {t.channel === 'email' && <Btn soft label={t.status === 'sent' ? `Sent to ${t.sent_count}` : 'Send emails'} icon="mail-outline" disabled={t.status === 'sent'} busy={busy === t.id} onPress={() => run(t.id, async () => { const r = await sendTouch(t.id); flash(r.message); })} />}
              {(t.channel === 'whatsapp' || t.channel === 'sms') && <Btn soft label="Prepare messages" icon="logo-whatsapp" busy={busy === t.id} onPress={async () => { setBusy(t.id); try { const r = await sendTouch(t.id); setPeople({ t, list: r.recipients ?? [] }); await reload(); } catch (e) { flash((e as Error).message); } setBusy(''); }} />}
              {ch?.social && <Btn soft label={t.social_post_id ? 'In Social Publishing' : 'To Social Publishing'} icon="share-social-outline" disabled={!!t.social_post_id} busy={busy === `s${t.id}`} onPress={() => run(`s${t.id}`, async () => { const r = await touchToSocial(t.id); flash(r.message); })} />}
              <Btn soft label="Share with link" icon="share-outline" onPress={() => shareCopy(t)} />
              <Btn soft label="Edit" icon="create-outline" onPress={() => setEdit(t)} />
              {t.status !== 'done' && <Btn soft label="Mark done" icon="checkmark" onPress={() => run(`d${t.id}`, () => updateTouch(t, { status: 'done' }, 'Marked done'), 'Marked done')} />}
            </View>
          </View>
        );
      })}
      {edit && <TouchEditor t={edit} flash={flash} onClose={() => setEdit(null)} reload={reload} />}
      <Modal visible={!!people} transparent animationType="slide" onRequestClose={() => setPeople(null)}>
        <View style={s.sheetWrap}><View style={s.sheet}>
          <View style={s.row}><Text style={[s.h, { flex: 1 }]}>{people ? `${channelLabel(people.t.channel)}: ${people.list.length} messages` : ''}</Text><Pressable onPress={() => setPeople(null)} hitSlop={10}><Ionicons name="close" size={24} color="#0B1220" /></Pressable></View>
          <Text style={s.tiny}>Each has the customer’s name and the tracked link. Customers marked “No marketing” are left out.</Text>
          <ScrollView style={{ maxHeight: 420, marginTop: 8 }}>{people?.list.map(p => (
            <View key={p.id} style={[s.row, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF1F4', gap: 8 }]}>
              <View style={{ flex: 1 }}><Text style={s.bold}>{p.name}</Text><Text style={s.tiny}>{p.phone}</Text></View>
              <Pressable onPress={() => Linking.openURL(p.link).catch(() => flash('Could not open the app'))} style={[s.btn, { height: 36, backgroundColor: '#25D366' }]}><Ionicons name="send" size={14} color="#FFF" /><Text style={s.btnText}>Send</Text></Pressable>
            </View>
          ))}</ScrollView>
        </View></View>
      </Modal>
      <Modal visible={!!adding} transparent animationType="slide" onRequestClose={() => setAdding(null)}>
        <View style={s.sheetWrap}><View style={s.sheet}>
          <View style={s.row}><Text style={[s.h, { flex: 1 }]}>Add a touch</Text><Pressable onPress={() => setAdding(null)} hitSlop={10}><Ionicons name="close" size={24} color="#0B1220" /></Pressable></View>
          {adding && <>
            <View style={[s.wrap, { marginTop: 8 }]}>{CHANNELS.map(x => <ChoiceChip key={x.k} on={adding.channel === x.k} label={x.label} onPress={() => setAdding({ ...adding, channel: x.k })} />)}</View>
            <TextInput value={adding.body} onChangeText={v => setAdding({ ...adding, body: v })} multiline placeholder="Message. Use {link} for the tracked link and {name} for the first name" style={[s.input, { minHeight: 100, marginTop: 10, paddingTop: 10 }]} />
            <View style={{ marginTop: 12 }}><Btn label="Add for tomorrow" disabled={!adding.body.trim()} onPress={() => run('add', async () => { await addTouch(c, adding.channel, new Date(Date.now() + 86400000).toISOString(), adding.body.trim()); setAdding(null); }, 'Touch added')} busy={busy === 'add'} /></View>
          </>}
        </View></View>
      </Modal>
    </>
  );
}

function TouchEditor({ t, flash, onClose, reload }: { t: Touch; flash: (t: string) => void; onClose: () => void; reload: () => Promise<void> }) {
  const [title, setTitle] = useState(t.title);
  const [body, setBody] = useState(t.body);
  const [busy, setBusy] = useState(false);
  const b = copyB(t);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetWrap}><View style={s.sheet}>
        <View style={s.row}><Text style={[s.h, { flex: 1 }]}>Edit {channelLabel(t.channel)} touch</Text><Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#0B1220" /></Pressable></View>
        <Text style={s.label}>Title</Text><TextInput value={title} onChangeText={setTitle} maxLength={160} style={s.input} />
        <Text style={s.label}>Message</Text><TextInput value={body} onChangeText={setBody} multiline style={[s.input, { minHeight: 140, paddingTop: 10, fontSize: 13 }]} />
        {!!b && b !== body && <Pressable onPress={() => setBody(b)}><Text style={[s.link, { marginTop: 6 }]}>Use copy B instead</Text></Pressable>}
        <View style={{ marginTop: 12, gap: 8 }}>
          <Btn label={busy ? 'Saving…' : 'Save'} busy={busy} disabled={!body.trim()} onPress={async () => { setBusy(true); try { await updateTouch(t, { title: title.trim(), body }, 'Edited'); flash('Saved'); await reload(); onClose(); } catch (e) { flash((e as Error).message); } setBusy(false); }} />
          <Pressable onPress={async () => { try { await deleteTouch(t.id); flash('Touch removed'); await reload(); onClose(); } catch (e) { flash((e as Error).message); } }}><Text style={[s.small, { textAlign: 'center', color: '#B42318' }]}>Remove this touch</Text></Pressable>
        </View>
      </View></View>
    </Modal>
  );
}

// Phone calendar: an agenda of the next touches grouped by day.
function Agenda({ touches, camps, onOpen }: { touches: Touch[]; camps: Campaign[]; onOpen: (id: string) => void }) {
  const [past, setPast] = useState(false);
  const [now] = useState(() => Date.now());
  const list = touches.filter(t => t.scheduled_at && (past || new Date(t.scheduled_at).getTime() >= now - 86400000)).sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));
  const groups = new Map<string, Touch[]>();
  for (const t of list) { const k = day(t.scheduled_at); groups.set(k, [...(groups.get(k) ?? []), t]); }
  return (
    <>
      <View style={s.wrap}><ChoiceChip on={!past} label="Coming up" onPress={() => setPast(false)} /><ChoiceChip on={past} label="Everything" onPress={() => setPast(true)} /></View>
      {!groups.size ? <View style={s.card}><Text style={s.small}>Nothing planned. Create a campaign in the AI Studio.</Text></View> : [...groups.entries()].map(([d, ts]) => (
        <View key={d} style={s.card}>
          <Text style={s.h}>{d}</Text>
          {ts.map(t => (
            <Pressable key={t.id} onPress={() => onOpen(t.campaign_id)} style={[s.row, { gap: 8, paddingVertical: 6 }]}>
              <Text style={[s.bold, { width: 90 }]} numberOfLines={1}>{channelLabel(t.channel)}</Text>
              <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{camps.find(c => c.id === t.campaign_id)?.name} · {t.title}</Text><Pill t={t.status} />
            </Pressable>
          ))}
        </View>
      ))}
    </>
  );
}

function Audiences({ ctx, plan }: { ctx: Context | null; plan: (key: string) => void }) {
  if (!ctx) return <ActivityIndicator color="#1E56A0" style={{ marginTop: 30 }} />;
  const max = Math.max(1, ...ctx.audiences.list.map(a => a.count));
  return (
    <View style={s.card}>
      <Text style={s.h}>Who you can reach</Text>
      <Text style={s.small}>Built from your Customers. {ctx.audiences.opted_out ? `${ctx.audiences.opted_out} asked not to get offers and are always left out.` : 'Customers tagged “No marketing” are always left out.'}</Text>
      {ctx.audiences.list.map(a => (
        <View key={a.key} style={{ marginTop: 10 }}>
          <View style={s.row}><Text style={[s.bold, { flex: 1, fontSize: 13 }]}>{a.label}</Text><Text style={s.bold}>{a.count}</Text>
            {a.count > 0 && <Pressable onPress={() => plan(a.key)} hitSlop={8}><Text style={[s.link, { marginLeft: 10 }]}>Plan</Text></Pressable>}</View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#F2F4F7', marginTop: 4 }}><View style={{ height: 8, borderRadius: 4, backgroundColor: '#1E56A0', width: `${(a.count / max) * 100}%` }} /></View>
        </View>
      ))}
    </View>
  );
}

function Results({ results, cur, onOpen }: { results: { campaigns: Result[] } | null; cur: string; onOpen: (id: string) => void }) {
  const { width } = useWindowDimensions();
  if (!results) return <ActivityIndicator color="#1E56A0" style={{ marginTop: 30 }} />;
  const cs = results.campaigns;
  if (!cs.length) return <View style={s.card}><Text style={s.small}>No campaigns yet.</Text></View>;
  const sum = (k: keyof Result['totals']) => cs.reduce((a, c) => a + (Number(c.totals[k]) || 0), 0);
  return (
    <>
      <Kpis items={[['Campaigns', String(cs.length)], ['Tracked visits', String(sum('visits'))], ['Orders', String(sum('orders'))], ['Sales', money(sum('sales'), cur)]]} />
      <ChartCard w={Math.min(width, 1100) - 60} cur={cur} c={{ type: 'bar', title: 'Orders by campaign', unit: 'count', items: cs.slice(0, 8).map(c => ({ label: c.name.slice(0, 12), value: c.totals.orders })) }} />
      {cs.map(c => (
        <Pressable key={c.id} onPress={() => onOpen(c.id)} style={s.card}>
          <Text style={s.bold} numberOfLines={1}>{c.name}</Text>
          <Text style={s.small}>{c.totals.visits} visits · {c.totals.enquiries + c.totals.chats} enquiries · {c.totals.orders} orders · {money(c.totals.sales, cur)}{c.totals.conversion !== null ? ` · ${c.totals.conversion}% convert` : ''}</Text>
        </Pressable>
      ))}
      <Text style={s.tiny}>Counted only from each campaign’s own tracked links, its discount code and website visits that carried its link. Nothing is estimated.</Text>
    </>
  );
}

function AdviceTab({ flash, goTo }: { flash: (t: string) => void; goTo?: (href: string) => void }) {
  const [a, setA] = useState<{ items: Advice[]; campaigns: number; tracked_visits: number } | null>(null);
  useEffect(() => { let live = true; loadAdvice().then(x => { if (live) setA(x); }, e => { if (live) { flash((e as Error).message); setA({ items: [], campaigns: 0, tracked_visits: 0 }); } }); return () => { live = false; }; }, [flash]);
  if (!a) return <ActivityIndicator color="#1E56A0" style={{ marginTop: 30 }} />;
  return (
    <>
      <Text style={s.small}>Each suggestion shows the numbers behind it ({a.tracked_visits} tracked visits across {a.campaigns} campaign{a.campaigns === 1 ? '' : 's'}).</Text>
      {!a.items.length ? <View style={s.card}><Text style={s.small}>Nothing to change right now.</Text></View> : a.items.map(x => (
        <View key={x.title} style={s.card}>
          <View style={[s.row, { gap: 8 }]}><Text style={[s.bold, { flex: 1 }]}>{x.title}</Text><Pill t={x.confidence === 'strong' ? 'done' : 'planned'} /></View>
          <Text style={s.tiny}>{x.confidence === 'strong' ? 'Strong evidence' : 'Early sign'}</Text>
          <Text style={[s.small, { marginTop: 4 }]}>Evidence: {x.evidence}</Text>
          <Text style={[s.small, { marginTop: 4, color: '#0B1220' }]}>Do: {x.action}</Text>
          {!!x.href && !!goTo && <Pressable onPress={() => goTo(x.href!)}><Text style={[s.link, { marginTop: 6 }]}>Start it ›</Text></Pressable>}
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E3E8EF' },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0B1220' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E8EF' },
  tabOn: { backgroundColor: '#0B2545', borderColor: '#0B2545' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#26313D' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EF', padding: 12 },
  h: { fontSize: 16, fontWeight: '800', color: '#0B1220', marginBottom: 6 },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  label: { marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  link: { fontSize: 13, fontWeight: '700', color: '#1E56A0' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF', textAlignVertical: 'top' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 14 },
  btnSoft: { backgroundColor: '#EEF4FC' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13.5 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,18,32,0.45)' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, maxHeight: '90%' },
});
