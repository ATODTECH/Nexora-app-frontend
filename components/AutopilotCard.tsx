import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { JOBS, WEEKDAYS, deleteReport, loadAutopilot, loadReports, markRead, runAutopilot, saveAutopilot, scheduleText, type Autopilot, type Chart, type Job, type Kpi, type Report } from '../lib/autopilot';

// A capability's visual dashboard and its autopilot (same as the website's CapabilityAutopilot + ReportView):
// figures, charts, photos, findings, next steps and online sources, with "Run now" and the schedule.
const C = ['#1E56A0', '#E8973A', '#2A9D8F', '#9B5DE5', '#C9A227', '#8A97A6'];
const SYM: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };
const compact = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(v / 1e3)}k` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v * 10) / 10}`; };
const fmtFor = (unit: string | undefined, cur: string) => (v: number) => unit === 'money' ? `${SYM[cur] ?? ''}${compact(v)}` : unit === 'percent' ? `${Math.round(v)}%` : compact(v);
const niceMax = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const open = (href?: string, go?: (href: string) => void) => { if (!href) return; if (/^https?:/.test(href)) Linking.openURL(href).catch(() => {}); else go?.(href); };

function LineChart({ c, cur, w }: { c: Extract<Chart, { type: 'line' }>; cur: string; w: number }) {
  const h = 170, pl = 40, pr = 8, pt = 8, pb = 22, iw = Math.max(1, w - pl - pr), ih = h - pt - pb;
  const max = niceMax(Math.max(1, ...c.series.flatMap(s => s.values.filter((v): v is number => typeof v === 'number'))));
  const n = c.x.length, X = (i: number) => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw), Y = (v: number) => pt + ih - (v / max) * ih;
  const fmt = fmtFor(c.unit, cur), every = Math.max(1, Math.ceil(n / 5));
  return (
    <View>
      <Svg width={w} height={h}>
        {[0, 0.5, 1].map(f => <React.Fragment key={f}><Line x1={pl} x2={w - pr} y1={Y(max * f)} y2={Y(max * f)} stroke="#E6ECF3" /><SvgText x={pl - 4} y={Y(max * f) + 3} fontSize={9} fill="#8A97A6" textAnchor="end">{fmt(max * f)}</SvgText></React.Fragment>)}
        {c.x.map((l, i) => (i % every === 0 || i === n - 1 ? <SvgText key={i} x={X(i)} y={h - 5} fontSize={9} fill="#8A97A6" textAnchor="middle">{l}</SvgText> : null))}
        {c.series.map((s, si) => {
          const segs: string[][] = [[]];
          s.values.forEach((v, i) => { if (typeof v === 'number') segs[segs.length - 1].push(`${X(i)},${Y(v)}`); else if (segs[segs.length - 1].length) segs.push([]); });
          return segs.filter(g => g.length).map((g, gi) => <Polyline key={`${si}${gi}`} points={g.join(' ')} fill="none" stroke={C[si % C.length]} strokeWidth={2} strokeDasharray={s.dashed ? '5,4' : undefined} />);
        })}
      </Svg>
      <View style={[st.row, { flexWrap: 'wrap', gap: 10 }]}>{c.series.map((s, si) => <Text key={s.name} style={st.tiny}><Text style={{ color: C[si % C.length] }}>● </Text>{s.name}</Text>)}</View>
      {'note' in c && !!c.note && <Text style={[st.tiny, { marginTop: 4 }]}>{c.note}</Text>}
    </View>
  );
}
function Donut({ items }: { items: { label: string; value: number }[] }) {
  const total = Math.max(1, items.reduce((a, b) => a + b.value, 0)), r = 46, len = 2 * Math.PI * r;
  let off = 0;
  return (
    <View style={[st.row, { gap: 14 }]}>
      <Svg width={120} height={120}>
        <Circle cx={60} cy={60} r={r} stroke="#EEF2F6" strokeWidth={16} fill="none" />
        {items.map((it, i) => { const l = (it.value / total) * len; const el = <Circle key={it.label} cx={60} cy={60} r={r} stroke={C[Math.min(i, C.length - 1)]} strokeWidth={16} fill="none" strokeDasharray={`${l},${len}`} strokeDashoffset={-off} rotation={-90} origin="60,60" />; off += l; return el; })}
        <SvgText x={60} y={65} fontSize={16} fontWeight="800" fill="#0B1220" textAnchor="middle">{String(items.reduce((a, b) => a + b.value, 0))}</SvgText>
      </Svg>
      <View style={{ flex: 1, gap: 3 }}>{items.map((it, i) => <View key={it.label} style={st.row}><View style={[st.dot, { backgroundColor: C[Math.min(i, C.length - 1)] }]} /><Text style={[st.small, { flex: 1, textTransform: 'capitalize' }]} numberOfLines={1}>{it.label}</Text><Text style={st.bold}>{it.value}</Text></View>)}</View>
    </View>
  );
}
export function ChartCard({ c, cur, w }: { c: Chart; cur: string; w: number }) {
  let body: React.ReactNode = null;
  if (c.type === 'line') body = <LineChart c={c} cur={cur} w={w} />;
  else if (c.type === 'bar') { const max = niceMax(Math.max(1, ...c.items.map(i => i.value))); const f = fmtFor(c.unit, cur); body = <View style={[st.row, { alignItems: 'flex-end', height: 150, gap: 6 }]}>{c.items.map(i => <View key={i.label} style={{ flex: 1, alignItems: 'center', gap: 3 }}><Text style={st.tiny}>{f(i.value)}</Text><View style={{ width: '70%', height: Math.max(2, (i.value / max) * 100), backgroundColor: C[0], borderTopLeftRadius: 4, borderTopRightRadius: 4 }} /><Text style={st.tiny} numberOfLines={1}>{i.label}</Text></View>)}</View>; }
  else if (c.type === 'donut') body = <Donut items={c.items} />;
  else if (c.type === 'rank') { const max = Math.max(1, ...c.items.map(i => i.value)); const f = fmtFor(c.unit, cur); body = <View style={{ gap: 10 }}>{c.items.map(i => <View key={i.label} style={[st.row, { gap: 10 }]}>{i.image ? <Image source={{ uri: i.image }} style={st.thumb} /> : <View style={[st.thumb, { backgroundColor: '#EEF2F6' }]} />}<View style={{ flex: 1 }}><View style={st.row}><Text style={[st.bold, { flex: 1 }]} numberOfLines={1}>{i.label}</Text><Text style={st.small}>{f(i.value)}</Text></View><View style={st.track}><View style={[st.fill, { width: `${(i.value / max) * 100}%` }]} /></View>{!!i.sub && <Text style={st.tiny}>{i.sub}</Text>}</View></View>)}</View>; }
  else if (c.type === 'heatmap') { const max = Math.max(1, ...c.grid.flat()); body = <View style={{ gap: 3 }}><View style={st.row}><Text style={[st.tiny, { width: 30 }]} />{c.cols.map(h => <Text key={h} style={[st.tiny, { flex: 1, textAlign: 'center' }]}>{h}</Text>)}</View>{c.rows.map((r, ri) => <View key={r} style={[st.row, { gap: 3 }]}><Text style={[st.tiny, { width: 30 }]}>{r}</Text>{c.cols.map((h, ci) => { const v = c.grid[ri]?.[ci] ?? 0; return <View key={h} style={{ flex: 1, height: 18, borderRadius: 4, backgroundColor: v ? `rgba(30,86,160,${0.12 + 0.88 * (v / max)})` : '#F1F4F8' }} />; })}</View>)}<Text style={st.tiny}>Darker = more engagement.</Text></View>; }
  else if (c.type === 'funnel') { const top = Math.max(1, ...c.steps.map((s) => s.value)); body = <View style={{ gap: 6 }}>{c.steps.map((s, i) => <View key={s.label}><View style={st.row}><Text style={[st.small, { flex: 1 }]}>{s.label}</Text><Text style={st.bold}>{s.value.toLocaleString()}</Text>{i > 0 && c.steps[i - 1].value > 0 && s.value <= c.steps[i - 1].value && <Text style={st.tiny}>  {Math.round((s.value / c.steps[i - 1].value) * 100)}%</Text>}</View><View style={st.track}><View style={[st.fill, { width: `${(s.value / top) * 100}%`, backgroundColor: C[i % C.length] }]} /></View></View>)}</View>; }
  else if (c.type === 'progress') body = <View style={{ gap: 10 }}>{c.items.map(i => { const p = i.target > 0 ? Math.min(100, Math.round((i.value / i.target) * 100)) : 0; return <View key={i.label}><View style={st.row}><Text style={[st.small, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>{i.label}</Text><Text style={st.tiny}>{compact(i.value)} / {compact(i.target)}  </Text><Text style={[st.bold, { color: p >= 100 ? '#15803D' : p >= 50 ? C[0] : '#B45309' }]}>{p}%</Text></View><View style={st.track}><View style={[st.fill, { width: `${p}%`, backgroundColor: p >= 100 ? '#15803D' : p >= 50 ? C[0] : '#E8973A' }]} /></View></View>; })}</View>;
  else if (c.type === 'scores') body = <View style={[st.row, { flexWrap: 'wrap', justifyContent: 'space-around' }]}>{c.items.map(i => { const col = i.value >= 90 ? '#15803D' : i.value >= 50 ? '#E8973A' : '#B42318', r = 24, len = 2 * Math.PI * r; return <View key={i.label} style={{ alignItems: 'center', width: 76 }}><Svg width={60} height={60}><Circle cx={30} cy={30} r={r} stroke="#EEF2F6" strokeWidth={6} fill="none" /><Circle cx={30} cy={30} r={r} stroke={col} strokeWidth={6} fill="none" strokeDasharray={`${(i.value / 100) * len},${len}`} rotation={-90} origin="30,30" /><SvgText x={30} y={35} fontSize={14} fontWeight="800" fill={col} textAnchor="middle">{String(i.value)}</SvgText></Svg><Text style={st.tiny}>{i.label}</Text></View>; })}{!!c.note && <Text style={[st.tiny, { width: '100%' }]}>{c.note}</Text>}</View>;
  else if (c.type === 'list') body = <View style={[st.row, { flexWrap: 'wrap', gap: 6 }]}>{c.items.map(i => <Pressable key={i.label} onPress={() => open(i.href)} style={st.chip}><Text style={st.chipText}>{i.label}{i.value ? `  ${i.value}` : ''}</Text></Pressable>)}</View>;
  return <View style={st.card}><Text style={[st.bold, { marginBottom: 8 }]}>{c.title}</Text>{body}</View>;
}
function KpiTile({ k, cur }: { k: Kpi; cur: string }) {
  const good = typeof k.change !== 'number' || k.change === 0 ? null : (k.change > 0) === (k.good !== 'down');
  return (
    <View style={st.kpi}>
      <Text style={st.tiny} numberOfLines={1}>{k.label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#0B1220', marginTop: 2 }}>{fmtFor(k.unit, cur)(k.value)}</Text>
      {typeof k.change === 'number' ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: good === null ? '#8A97A6' : good ? '#15803D' : '#B42318' }}>{k.change > 0 ? '▲' : k.change < 0 ? '▼' : ''} {Math.abs(k.change)}% vs before</Text> : !!k.note && <Text style={st.tiny} numberOfLines={1}>{k.note}</Text>}
    </View>
  );
}
export function ReportCards({ r, goTo }: { r: Report; goTo?: (href: string) => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 1100) - 64;
  const cur = r.data.currency ?? '', d = r.data;
  return (
    <View style={{ gap: 12 }}>
      <View style={[st.card, { backgroundColor: '#EEF4FC', borderColor: '#D5E3F5' }]}>
        <Text style={[st.tiny, { color: '#1E56A0', fontWeight: '600' }]}>{new Date(r.created_at).toLocaleString()} · {r.trigger === 'manual' ? 'Run by you' : 'Autopilot'}</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: '#0B1220', marginTop: 2 }}>{r.title}</Text>
        {!!r.summary && <Text style={[st.small, { marginTop: 4, color: '#26313D' }]}>{r.summary}</Text>}
      </View>
      {!!d.kpis.length && <View style={[st.row, { flexWrap: 'wrap', gap: 8 }]}>{d.kpis.map(k => <KpiTile key={k.label} k={k} cur={cur} />)}</View>}
      {!!d.highlights.length && <View style={st.card}><Text style={[st.bold, { marginBottom: 6 }]}>💡 What Nexora found</Text>{d.highlights.map(h => <Text key={h} style={[st.small, { marginTop: 3 }]}>• {h}</Text>)}</View>}
      {!!d.actions.length && <View style={st.card}><Text style={[st.bold, { marginBottom: 6 }]}>✅ Do next</Text>{d.actions.map(a => <Pressable key={a.text} onPress={() => open(a.href, goTo)} style={st.action}><Text style={[st.small, { flex: 1, fontWeight: '600', color: '#0B1220' }]}>{a.text}</Text>{!!a.href && <Ionicons name="arrow-forward" size={16} color="#1E56A0" />}</Pressable>)}</View>}
      {d.charts.map((c, i) => <ChartCard key={`${c.title}${i}`} c={c} cur={cur} w={w} />)}
      {!!d.images.length && <View style={st.card}><Text style={[st.bold, { marginBottom: 6 }]}>Photos</Text><ScrollView horizontal contentContainerStyle={{ gap: 10 }}>{d.images.map(im => <Pressable key={im.url} onPress={() => open(im.link, goTo)} style={{ width: 170 }}><Image source={{ uri: im.url }} style={{ width: 170, height: 125, borderRadius: 10, backgroundColor: '#EEF2F6' }} /><Text style={st.tiny} numberOfLines={2}>{im.caption}{im.credit ? ` · ${im.credit}` : ''}</Text></Pressable>)}</ScrollView></View>}
      {!!d.sources.length && <View style={st.card}><Text style={[st.bold, { marginBottom: 6 }]}>🌐 Found online</Text>{d.sources.map(s => <Pressable key={s.url} onPress={() => open(s.url)}><Text style={[st.small, { color: '#1E56A0', marginTop: 4 }]} numberOfLines={1}>{s.title}</Text></Pressable>)}</View>}
      <Text style={st.tiny}>Figures come from your own Nexora records; online findings link to their sources. Estimates are marked as estimates.</Text>
    </View>
  );
}

function Opt({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[st.chip, on && st.chipOn]}><Text style={[st.chipText, on && { color: '#FFF' }]}>{label}</Text></Pressable>;
}
export { Opt as ChoiceChip };

export function AutopilotCard({ job, flash, goTo, choices }: { job: Job; flash: (t: string) => void; goTo?: (href: string) => void; choices?: { accounts?: { id: string; name: string; platform: string }[]; plans?: { id: string; title: string }[] } }) {
  const info = JOBS[job];
  const [a, setA] = useState<Autopilot | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'run'>('');
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    let live = true;
    loadAutopilot(job).then(x => { if (live) setA(x); }, () => {});
    loadReports(job).then(r => { if (live) { setReports(r); setSel(r[0]?.id ?? null); } }, () => { if (live) setReports([]); });
    return () => { live = false; };
  }, [job]);
  const current = reports?.find(r => r.id === sel) ?? null;
  useEffect(() => { if (current && !current.read_at) markRead(current.id); }, [current]);
  const set = (p: Partial<Autopilot>) => { if (a) setA({ ...a, ...p }); };
  const opt = (k: string, v: unknown) => { if (a) setA({ ...a, options: { ...a.options, [k]: v } }); };
  const run = async () => {
    if (!a) return; setBusy('run');
    try { const r = await runAutopilot(job, a.options, a.mode); const list = await loadReports(job); setReports(list); setSel(r.id ?? list[0]?.id ?? null); flash(r.status === 'failed' ? 'Nexora couldn’t finish this time.' : 'Your report is ready'); } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const save = async () => { if (!a) return; setBusy('save'); try { const s = await saveAutopilot(a); setA(s); flash(s.enabled ? `Autopilot on: ${scheduleText(s)}` : 'Autopilot is off'); setEdit(false); } catch (e) { flash((e as Error).message); } setBusy(''); };
  return (
    <View style={{ gap: 12 }}>
      <View style={st.card}>
        <View style={[st.row, { alignItems: 'flex-start', gap: 10 }]}>
          <View style={st.icon}><Ionicons name="rocket-outline" size={20} color="#1E56A0" /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.bold}>{info.name}</Text>
            <Text style={st.small}>{info.what}</Text>
            {a && <Text style={[st.tiny, { marginTop: 4, color: a.enabled ? '#15803D' : '#8A97A6', fontWeight: '700' }]}>{a.enabled ? `Autopilot on · ${scheduleText(a)}` : 'Autopilot off'}{a.enabled && a.next_run_at ? ` · next ${new Date(a.next_run_at).toLocaleString()}` : ''}</Text>}
          </View>
        </View>
        <View style={[st.row, { gap: 8, marginTop: 10 }]}>
          <Pressable onPress={run} disabled={!a || !!busy} style={[st.btn, { flex: 1 }]}>{busy === 'run' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="play-circle-outline" size={18} color="#FFF" />}<Text style={st.btnText}>{busy === 'run' ? 'Working…' : 'Run now'}</Text></Pressable>
          <Pressable onPress={() => setEdit(v => !v)} style={[st.btn, st.btnSoft, { flex: 1 }]}><Ionicons name="flash-outline" size={18} color="#1E56A0" /><Text style={[st.btnText, { color: '#1E56A0' }]}>{edit ? 'Close' : 'Automate'}</Text></Pressable>
        </View>
        {busy === 'run' && <Text style={[st.small, { marginTop: 8, color: '#1E56A0' }]}>Nexora is reading your figures and searching online. This can take up to two minutes.</Text>}
        {edit && a && (
          <View style={{ marginTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingTop: 12 }}>
            <View style={st.row}><Text style={[st.bold, { flex: 1 }]}>Let Nexora do this automatically</Text><Switch value={a.enabled} onValueChange={v => set({ enabled: v })} /></View>
            <Text style={st.label}>How often</Text>
            <View style={[st.row, { gap: 6 }]}>{(['daily', 'weekly', 'monthly'] as const).map(f => <Opt key={f} on={a.frequency === f} label={f === 'daily' ? 'Every day' : f === 'weekly' ? 'Every week' : 'Every month'} onPress={() => set({ frequency: f })} />)}</View>
            {a.frequency === 'weekly' && <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{WEEKDAYS.map((d, i) => <Opt key={d} on={a.weekday === i} label={d.slice(0, 3)} onPress={() => set({ weekday: i })} />)}</ScrollView>}
            {a.frequency === 'monthly' && <View style={st.row}><Text style={[st.small, { flex: 1 }]}>Day of the month (1–28)</Text><TextInput value={String(a.day_of_month)} onChangeText={t => set({ day_of_month: Math.max(1, Math.min(28, +t || 1)) })} keyboardType="number-pad" style={[st.input, { width: 70 }]} /></View>}
            <View style={st.row}><Text style={[st.small, { flex: 1 }]}>Hour (0–23, your time)</Text><TextInput value={String(a.hour)} onChangeText={t => set({ hour: Math.max(0, Math.min(23, +t || 0)) })} keyboardType="number-pad" style={[st.input, { width: 70 }]} /></View>
            {info.modes.length > 1 && <View style={{ gap: 6 }}>{info.modes.map(m => <Pressable key={m.k} onPress={() => set({ mode: m.k })} style={[st.mode, a.mode === m.k && { borderColor: '#1E56A0', backgroundColor: '#EEF4FC' }]}><Text style={st.bold}>{m.label}</Text><Text style={st.tiny}>{m.hint}</Text></Pressable>)}</View>}
            {job === 'social_autopilot' && a.mode !== 'report' && <>
              <Text style={st.label}>New posts each time</Text>
              <View style={[st.row, { gap: 6 }]}>{[1, 2, 3].map(n => <Opt key={n} on={Number(a.options.posts ?? 2) === n} label={String(n)} onPress={() => opt('posts', n)} />)}</View>
              {!!choices?.accounts?.length && <><Text style={st.label}>Post to (none = all)</Text><View style={[st.row, { flexWrap: 'wrap', gap: 6 }]}>{choices.accounts.map(x => { const ids = (a.options.account_ids as string[] | undefined) ?? []; const on = ids.includes(x.id); return <Opt key={x.id} on={on} label={`${x.name} · ${x.platform}`} onPress={() => opt('account_ids', on ? ids.filter(i => i !== x.id) : [...ids, x.id])} />; })}</View></>}
            </>}
            {job === 'plan_review' && !!choices?.plans?.length && <><Text style={st.label}>Plan to research online</Text><View style={[st.row, { flexWrap: 'wrap', gap: 6 }]}><Opt on={!a.options.plan_id} label="The one I worked on last" onPress={() => opt('plan_id', undefined)} />{choices.plans.map(p => <Opt key={p.id} on={a.options.plan_id === p.id} label={p.title} onPress={() => opt('plan_id', p.id)} />)}</View></>}
            <Pressable onPress={save} disabled={busy === 'save'} style={st.btn}><Text style={st.btnText}>{busy === 'save' ? 'Saving…' : 'Save'}</Text></Pressable>
          </View>
        )}
      </View>
      {reports === null ? <ActivityIndicator color="#1E56A0" /> : !reports.length ? <View style={st.card}><Text style={[st.small, { textAlign: 'center' }]}>No reports yet. Press Run now to see your first one, or turn on the autopilot.</Text></View> : <>
        {reports.length > 1 && <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{reports.map(r => <Opt key={r.id} on={sel === r.id} label={new Date(r.created_at).toLocaleDateString()} onPress={() => setSel(r.id)} />)}</ScrollView>}
        {current && <><ReportCards r={current} goTo={goTo} /><Pressable onPress={async () => { try { await deleteReport(current.id); const l = reports.filter(x => x.id !== current.id); setReports(l); setSel(l[0]?.id ?? null); } catch (e) { flash((e as Error).message); } }}><Text style={[st.tiny, { color: '#B42318' }]}>Delete this report</Text></Pressable></>}
      </>}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  label: { fontSize: 12, fontWeight: '600', color: '#5C6B7A', marginTop: 4 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EF', padding: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  thumb: { width: 38, height: 38, borderRadius: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EEF2F6', overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#1E56A0' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#EEF4FC' },
  chipOn: { backgroundColor: '#1E56A0' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#1E56A0' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, marginTop: 6 },
  icon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF4FC', alignItems: 'center', justifyContent: 'center' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 16 },
  btnSoft: { backgroundColor: '#EEF4FC' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  mode: { borderWidth: 1, borderColor: '#E3E8EF', borderRadius: 12, padding: 10 },
  input: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 10, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
});
