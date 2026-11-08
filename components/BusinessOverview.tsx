import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';
import {
  AREA_TEXT, KIND_HELP, KIND_TEXT, changePct, fmtDate, fmtValue, loadOverview, overviewText, rangeText, reportRows,
  type Area, type Kind, type Kpi, type Overview, type RangeDays,
} from '../lib/analytics';
import { download, toCsv } from '../lib/inventory';

// Capability 2.11 in the app: the Business overview at the top of Insights (same figures and rules as the website).
// Every figure shows its dates, meaning and source, and a badge for Measured, Estimate or AI view.

const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', FAINT = '#8A97A6', GRID = '#E6ECF3', GOOD = '#15803D', BAD = '#B42318', WARN = '#B45309';
const KIND_COL: Record<Kind, [string, string]> = { measured: ['#E9F8EE', GOOD], estimate: ['#FFF4E5', WARN], ai: ['#F1EAFE', '#6D3FC0'] };
const SYM: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };

export function KindBadge({ k }: { k: Kind }) {
  return <View style={{ backgroundColor: KIND_COL[k][0], borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: KIND_COL[k][1] }}>{KIND_TEXT[k]}</Text></View>;
}

type Props = {
  businessName: string; bizCurrency: string; width: number; canExport: boolean;
  callFn: (name: string, body: Record<string, unknown>) => Promise<any>;
  onGo: (href: string) => void; onAsk: (question: string) => void; onDaily?: (ov: Overview | null) => void; onExported?: (count: number) => void;
  /** Draws the day-by-day money chart (the app's own line chart), at the given width. */
  renderDaily?: (ov: Overview, width: number) => React.ReactNode;
};

export function BusinessOverview({ businessName, bizCurrency, width, canExport, callFn, onGo, onAsk, onDaily, onExported, renderDaily }: Props) {
  const [range, setRange] = useState<RangeDays>(30);
  const [ov, setOv] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [openDef, setOpenDef] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [inner, setInner] = useState(0);   // the card's inside width, so tiles fit exactly two (or more) per row

  useEffect(() => {
    let live = true;
    loadOverview(range, bizCurrency, callFn).then(r => { if (live) { setOv(r); setErr(''); onDaily?.(r); } }, () => { if (live) setErr("Couldn't load the overview. Check your connection and try again."); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // callFn and onDaily are new functions on every render of the screen; the overview reloads only when the period changes or on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, bizCurrency, tick]);

  const cur = ov?.currency || bizCurrency;
  const money = (v: number) => `${v < 0 ? '-' : ''}${SYM[cur] ?? (cur ? `${cur} ` : '')}${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
  const avail = inner || Math.max(240, width - 34);
  const areas = (Object.keys(AREA_TEXT) as Area[]).filter(a => ov?.kpis.some(k => k.area === a));
  const show = (a: Area) => (area === 'all' || area === a) && !!ov?.kpis.some(k => k.area === a);
  const kp = (key: string) => ov?.kpis.find(k => k.key === key);
  const kpis = (keys: string[]) => keys.map(kp).filter(Boolean) as Kpi[];
  const cardW = avail >= 760 ? Math.floor((avail - 12) / 2) - 1 : avail;
  const pick = (r: RangeDays) => { if (r !== range) { setBusy(true); setRange(r); } };
  const explain = () => ov && onAsk(`Explain my business numbers in simple words. Say what is going well, what looks unusual, and the three most useful things to do next. Keep measured facts separate from your own reading.\n\n${overviewText(ov, money, businessName)}`);
  const report = () => { if (!ov) return; download(`nexora-report-${ov.range}d-${ov.to.toISOString().slice(0, 10)}.csv`, `${Platform.OS === 'web' ? '﻿' : ''}${toCsv(reportRows(ov, money, businessName))}`); onExported?.(ov.kpis.length); };
  const print = () => { if (ov && Platform.OS === 'web') { printReport(ov, money, businessName); onExported?.(ov.kpis.length); } };
  const btn = (icon: string, label: string, onPress: () => void, primary = false) => (
    <Pressable onPress={onPress} disabled={!ov} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 13, borderRadius: 18, backgroundColor: primary ? BLUE : '#FFFFFF', borderWidth: primary ? 0 : 1, borderColor: GRID, opacity: ov ? 1 : 0.5 }}>
      <Ionicons name={icon as any} size={15} color={primary ? '#FFFFFF' : INK} /><Text style={{ fontSize: 13, fontWeight: '700', color: primary ? '#FFFFFF' : INK }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: GRID, padding: 16 }} accessibilityLabel="Business dashboard">
      <Text style={{ fontSize: 17, fontWeight: '900', color: INK }}>Business dashboard</Text>
      <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{ov ? `${rangeText(ov)} · compared with the ${ov.range} days before` : 'Your sales, customers, stock, marketing and online shop in one place'}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#F4F7FB', borderRadius: 18, borderWidth: 1, borderColor: GRID, padding: 2, marginTop: 10 }}>
        {([7, 30, 90] as RangeDays[]).map(r => (
          <Pressable key={r} onPress={() => pick(r)} accessibilityRole="radio" accessibilityState={{ checked: range === r }} style={{ height: 32, paddingHorizontal: 13, borderRadius: 16, justifyContent: 'center', backgroundColor: range === r ? '#FFFFFF' : 'transparent' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: range === r ? INK : MUTED }}>{`${r} days`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {btn('sparkles', 'Explain with Nexora', explain, true)}
        {canExport && btn('cloud-download-outline', Platform.OS === 'web' ? 'Download report' : 'Share report', report)}
        {Platform.OS === 'web' && btn('print-outline', 'Print or save as PDF', print)}
        <Pressable onPress={() => { setBusy(true); setTick(t => t + 1); }} accessibilityLabel="Refresh the overview" style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: GRID, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator size="small" color={BLUE} /> : <Ionicons name="refresh" size={16} color={MUTED} />}
        </Pressable>
      </View>
      <View style={{ marginTop: 10, gap: 4 }}>
        {(['measured', 'estimate', 'ai'] as Kind[]).map(k => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><KindBadge k={k} /><Text style={{ fontSize: 11.5, color: MUTED, flexShrink: 1 }}>{KIND_HELP[k]}</Text></View>)}
      </View>

      {!!err && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF4E5', borderRadius: 12, padding: 12, marginTop: 12 }}>
          <Ionicons name="alert-circle" size={16} color={WARN} /><Text style={{ flex: 1, fontSize: 13, color: '#7A4A06' }}>{err}</Text>
          <Pressable onPress={() => { setBusy(true); setTick(t => t + 1); }}><Text style={{ color: BLUE, fontWeight: '700' }}>Try again</Text></Pressable>
        </View>
      )}
      {!ov && busy && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}><ActivityIndicator size="small" color={BLUE} /><Text style={{ fontSize: 13, color: MUTED }}>Adding up your records…</Text></View>}

      {ov && (
        <View style={{ opacity: busy ? 0.6 : 1 }} onLayout={e => { const w = Math.round(e.nativeEvent.layout.width); if (w && w !== inner) setInner(w); }}>
          {areas.length > 1 && (
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {(['all', ...areas] as (Area | 'all')[]).map(a => (
                <Pressable key={a} onPress={() => setArea(a)} accessibilityRole="tab" accessibilityState={{ selected: area === a }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', borderWidth: 1, borderColor: area === a ? BLUE : GRID, backgroundColor: area === a ? '#EAF1FB' : '#FFFFFF' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: area === a ? BLUE : '#334155' }}>{a === 'all' ? 'Everything' : AREA_TEXT[a]}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
            {show('sales') && (
              <ChartCard w={cardW} title="Money received, day by day" subtitle={`Last ${ov.range} days against the ${ov.range} before · tap a day`} k={kp('sales')} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}>
                {renderDaily ? renderDaily(ov, cardW - 30) : null}
              </ChartCard>
            )}
            {show('sales') && (
              <ChartCard w={cardW} title="Orders and money, this period against the one before" ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}>
                <PairBars rows={kpis(['orders', 'cancel'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} />
                <View style={{ marginTop: 12 }}><PairBars rows={kpis(['avg', 'unpaid'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} /></View>
                {ov.channels.length > 0 && <>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, color: FAINT, marginTop: 16, marginBottom: 6 }}>WHERE THE MONEY CAME FROM</Text>
                  <Bars items={ov.channels.map(c => ({ label: c.label, value: c.sales, sub: `${c.orders} order${c.orders === 1 ? '' : 's'}` }))} fmt={money} />
                </>}
              </ChartCard>
            )}
            {show('customers') && (
              <ChartCard w={cardW} title="Leads and customers" subtitle="This period against the one before" ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}>
                <PairBars rows={kpis(['buyers', 'newcust', 'newleads', 'chats', 'won', 'openleads'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} />
              </ChartCard>
            )}
            {show('stock') && (
              <ChartCard w={cardW} title="Products and stock" subtitle="Units sold, and your tracked products by stock level today" ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}>
                <PairBars rows={kpis(['units'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} />
                <StockBar s={ov.stock} onGo={onGo} />
              </ChartCard>
            )}
            {show('marketing') && (
              <ChartCard w={cardW} title="Campaigns and sales" subtitle="Money each campaign brought in this period" ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}
                right={<Pressable onPress={() => onGo('/campaigns')} hitSlop={6}><Text style={{ fontSize: 12.5, fontWeight: '700', color: BLUE }}>Campaigns</Text></Pressable>}>
                <CampaignBars ov={ov} money={money} />
                <View style={{ marginTop: 14 }}><PairBars rows={kpis(['camps', 'posts', 'campsales'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} /></View>
              </ChartCard>
            )}
            {show('online') && (
              <ChartCard w={cardW} title="Shop link and website" subtitle="This period against the one before" ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo}>
                <PairBars rows={kpis(['visits', 'enq', 'conv', 'webev', 'weborders'])} ov={ov} money={money} open={openDef} setOpen={setOpenDef} onGo={onGo} />
              </ChartCard>
            )}
          </View>
          {!!ov.otherCurrency && <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>{`${ov.otherCurrency} order${ov.otherCurrency === 1 ? '' : 's'} in another currency ${ov.otherCurrency === 1 ? 'is' : 'are'} not added to these ${ov.currency} totals.`}</Text>}
          <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>{`Worked out ${ov.generated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} from records saved in Nexora. Today counts up to now. Tap ⓘ to see what a figure counts.`}</Text>
        </View>
      )}
    </View>
  );
}

type CardProps = { w: number; title: string; subtitle?: string; k?: Kpi; ov: Overview; money: (v: number) => string; open: string | null; setOpen: (v: string | null) => void; onGo: (href: string) => void; right?: React.ReactNode; children: React.ReactNode };
function ChartCard({ w, title, subtitle, k, ov, money, open, setOpen, onGo, right, children }: CardProps) {
  const ch = k ? changePct(k.value, k.prev) : null;
  return (
    <View style={{ width: w, borderRadius: 16, borderWidth: 1, borderColor: GRID, backgroundColor: '#F8FAFC', padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: INK }}>{title}</Text>
          {!!subtitle && <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {k && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => onGo(k.href)}><Text style={{ fontSize: 22, fontWeight: '900', color: INK }}>{fmtValue(k, money)}</Text></Pressable>
          {ch !== null && <Text style={{ fontSize: 12, fontWeight: '700', color: k.few || Math.abs(ch) < 5 ? FAINT : (k.lowerIsBetter ? ch <= 0 : ch >= 0) ? GOOD : BAD }}>{`${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%`}</Text>}
          <KindBadge k={k.kind} /><Text style={{ fontSize: 10.5, color: FAINT }}>{`From: ${k.source}`}</Text>
          <Pressable onPress={() => setOpen(open === k.key ? null : k.key)} hitSlop={8} accessibilityLabel={`What ${k.label} means`}><Ionicons name="information-circle-outline" size={17} color={open === k.key ? BLUE : FAINT} /></Pressable>
        </View>
      )}
      {k && open === k.key && <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#334155', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, marginTop: 6 }}>{`${k.def} ${fmtDate(ov.from)} – ${fmtDate(ov.to)}.`}</Text>}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

/** One row per figure: this period (blue) against the period before (grey). */
function PairBars({ rows, ov, money, open, setOpen, onGo }: { rows: Kpi[]; ov: Overview; money: (v: number) => string; open: string | null; setOpen: (v: string | null) => void; onGo: (href: string) => void }) {
  if (!rows.length) return null;
  const max = (f: Kpi['fmt']) => Math.max(1, ...rows.filter(r => r.fmt === f).flatMap(r => [r.value ?? 0, r.snapshot ? 0 : r.prev ?? 0]));
  return (
    <View style={{ gap: 10 }}>
      {rows.map(r => {
        const m = r.fmt === 'pct' ? 100 : max(r.fmt), ch = changePct(r.value, r.prev);
        return (
          <View key={r.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => setOpen(open === r.key ? null : r.key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`What ${r.label} means`}>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#334155', flexShrink: 1 }}>{r.label}</Text>
                <Ionicons name="information-circle-outline" size={14} color={FAINT} />
              </Pressable>
              {r.kind !== 'measured' && <KindBadge k={r.kind} />}
              <Pressable onPress={() => onGo(r.href)}><Text style={{ fontSize: 12, fontWeight: '800', color: INK }}>{fmtValue(r, money)}</Text></Pressable>
              {r.snapshot ? <Text style={{ fontSize: 11, color: FAINT }}>today</Text> : ch !== null ? <Text style={{ fontSize: 11, fontWeight: '700', color: r.few || Math.abs(ch) < 5 ? FAINT : (r.lowerIsBetter ? ch <= 0 : ch >= 0) ? GOOD : BAD }}>{`${ch >= 0 ? '▲' : '▼'}${Math.abs(ch)}%`}</Text> : null}
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: '#EEF2F7', marginTop: 4, overflow: 'hidden' }}><View style={{ height: 10, borderRadius: 5, backgroundColor: BLUE, width: `${Math.min(100, ((r.value ?? 0) / m) * 100)}%` }} /></View>
            {!r.snapshot && r.prev !== null && <View style={{ height: 6, borderRadius: 3, backgroundColor: '#EEF2F7', marginTop: 2, overflow: 'hidden' }}><View style={{ height: 6, borderRadius: 3, backgroundColor: '#B8C4D3', width: `${Math.min(100, (r.prev / m) * 100)}%` }} /></View>}
            {open === r.key && <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#334155', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, marginTop: 6 }}>{`${r.def} ${r.snapshot ? 'Counted today.' : `${fmtDate(ov.from)} – ${fmtDate(ov.to)}. From: ${r.source}.`}`}</Text>}
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 8, borderRadius: 4, backgroundColor: BLUE }} /><Text style={{ fontSize: 10.5, color: FAINT }}>This period</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: '#B8C4D3' }} /><Text style={{ fontSize: 10.5, color: FAINT }}>The period before</Text></View>
      </View>
    </View>
  );
}

function Bars({ items, fmt }: { items: { label: string; value: number; sub?: string }[]; fmt: (v: number) => string }) {
  const m = Math.max(1, ...items.map(i => i.value));
  return (
    <View style={{ gap: 8 }}>
      {items.map(i => (
        <View key={i.label}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#334155' }}>{i.label}</Text><Text style={{ fontSize: 12, fontWeight: '800', color: INK }}>{fmt(i.value)}</Text></View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: '#EEF2F7', marginTop: 4, overflow: 'hidden' }}><View style={{ height: 10, borderRadius: 5, backgroundColor: BLUE, width: `${(i.value / m) * 100}%` }} /></View>
          {!!i.sub && <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{i.sub}</Text>}
        </View>
      ))}
    </View>
  );
}

function StockBar({ s, onGo }: { s: Overview['stock']; onGo: (href: string) => void }) {
  const total = s.out + s.low + s.ok;
  if (!total) return <Text style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>No products with a stock count yet. Add stock counts in Products and stock.</Text>;
  const parts = [{ l: 'Out of stock', v: s.out, c: BAD }, { l: 'Low or running out', v: s.low, c: '#E8973A' }, { l: 'In stock', v: s.ok, c: '#2A9D8F' }];
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}><Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, color: FAINT }}>STOCK TODAY</Text><KindBadge k="measured" /></View>
      <View style={{ flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#EEF2F7' }}>{parts.map(p => p.v > 0 ? <View key={p.l} style={{ flex: p.v, backgroundColor: p.c }} /> : null)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {parts.map(p => <Pressable key={p.l} onPress={() => onGo('/inventory')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.c }} /><Text style={{ fontSize: 11.5, color: '#334155' }}>{`${p.l} `}<Text style={{ fontWeight: '800' }}>{p.v}</Text></Text></Pressable>)}
      </View>
      <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>“Low or running out” is an estimate from the reminder level and the selling pace.</Text>
    </View>
  );
}

function CampaignBars({ ov, money }: { ov: Overview; money: (v: number) => string }) {
  if (!ov.campaigns.length) return <Text style={{ fontSize: 12.5, color: MUTED }}>No campaign was running in this period. Campaigns with a tracked link or a discount code show their orders here.</Text>;
  const m = Math.max(1, ...ov.campaigns.flatMap(c => [c.sales, c.during ?? 0, c.before ?? 0]));
  return (
    <View style={{ gap: 12 }}>
      {ov.campaigns.map(c => {
        const v = c.kind === 'measured' ? c.sales : c.during || 0;
        return (
          <View key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: '700', color: INK }}>{c.name}</Text><KindBadge k={c.kind} /><Text style={{ fontSize: 12, fontWeight: '800', color: INK }}>{money(v)}</Text></View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: '#EEF2F7', marginTop: 4, overflow: 'hidden' }}><View style={{ height: 10, borderRadius: 5, backgroundColor: c.kind === 'measured' ? BLUE : '#E8973A', width: `${(v / m) * 100}%` }} /></View>
            {c.kind === 'estimate' && <View style={{ height: 6, borderRadius: 3, backgroundColor: '#EEF2F7', marginTop: 2, overflow: 'hidden' }}><View style={{ height: 6, borderRadius: 3, backgroundColor: '#B8C4D3', width: `${((c.before || 0) / m) * 100}%` }} /></View>}
            <Text style={{ fontSize: 11, lineHeight: 15, color: MUTED, marginTop: 4 }}>{`${c.window}${c.kind === 'measured' ? ` · ${c.orders} tracked order${c.orders === 1 ? '' : 's'}` : ` · same days before: ${money(c.before || 0)}`}. ${c.note}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Unusual changes found in the records (measured), each with a next step. Shown on the Advice tab. */
export function UnusualChanges({ ov, currency, onGo, onAsk }: { ov: Overview | null; currency: string; onGo: (href: string) => void; onAsk: (q: string) => void }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: GRID, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: INK }}>Unusual changes</Text><KindBadge k="measured" /></View>
      <Text style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 10 }}>{ov ? `${rangeText(ov)} · found in your records, with a next step` : 'Found in your records, with a next step'}</Text>
      {!ov ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator size="small" color={BLUE} /><Text style={{ fontSize: 13, color: MUTED }}>Checking your records…</Text></View>
        : !ov.anomalies.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={16} color={GOOD} /><Text style={{ fontSize: 13, color: MUTED }}>Nothing unusual in this period.</Text></View>
        : ov.anomalies.map(x => (
          <View key={x.key} style={{ borderLeftWidth: 4, borderLeftColor: x.tone === 'good' ? GOOD : x.tone === 'bad' ? BAD : WARN, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: INK }}>{x.title}</Text>
            <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 18 }}>{x.detail}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
              <Pressable onPress={() => onGo(x.action.href)} hitSlop={6}><Text style={{ fontSize: 12.5, fontWeight: '700', color: BLUE }}>{`${x.action.label} ›`}</Text></Pressable>
              <Pressable onPress={() => onAsk(x.ask)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="sparkles" size={13} color="#6D3FC0" /><Text style={{ fontSize: 12.5, fontWeight: '700', color: '#6D3FC0' }}>Ask Nexora why</Text></Pressable>
            </View>
          </View>
        ))}
    </View>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
/** Web copy of the app: a clean one-page report in the print dialog (which can save it as a PDF). */
function printReport(ov: Overview, money: (v: number) => string, business: string) {
  const doc0 = (globalThis as any).document;
  if (!doc0) return;
  const row = (k: Kpi) => { const ch = changePct(k.value, k.prev); return `<tr><td>${esc(k.label)}</td><td class="n">${esc(fmtValue(k, money))}</td><td class="n">${k.snapshot ? 'today' : k.prev === null ? '' : esc(fmtValue({ fmt: k.fmt, value: k.prev }, money))}</td><td class="n">${ch === null ? '' : `${ch >= 0 ? '+' : ''}${ch}%`}</td><td>${KIND_TEXT[k.kind]}</td><td class="d">${esc(k.def)}<br><i>From: ${esc(k.source)}</i></td></tr>`; };
  const areas = (Object.keys(AREA_TEXT) as Area[]).filter(a => ov.kpis.some(k => k.area === a));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Nexora report ${esc(rangeText(ov))}</title><style>
body{font:12px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0B1220;margin:28px}h1{font-size:20px;margin:0}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#5C6B7A}
p.m{color:#5C6B7A;margin:2px 0 0}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #E6ECF3;padding:6px;text-align:left;vertical-align:top}th{font-size:11px;color:#5C6B7A}
.n{text-align:right;white-space:nowrap;font-weight:600}.d{color:#3A4757;font-size:11px}i{color:#8A97A6}.k{font-size:11px;color:#5C6B7A;margin-top:10px}</style></head><body>
<h1>${esc(business || 'Your business')} · business report</h1><p class="m">${esc(rangeText(ov))}, compared with the ${ov.range} days before · amounts in ${esc(ov.currency)} · made ${esc(ov.generated.toLocaleString())}</p>
<p class="k">Measured = counted from records saved in Nexora. Estimate = worked out from patterns, a guide not a result.</p>
${areas.map(a => `<h2>${esc(AREA_TEXT[a])}</h2><table><tr><th>Figure</th><th class="n">This period</th><th class="n">Before</th><th class="n">Change</th><th>Type</th><th>What it means</th></tr>${ov.kpis.filter(k => k.area === a).map(row).join('')}</table>`).join('')}
${ov.anomalies.length ? `<h2>Unusual changes (measured)</h2><table>${ov.anomalies.map(x => `<tr><td><b>${esc(x.title)}</b><br><span class="d">${esc(x.detail)}</span></td><td>${esc(x.action.label)}</td></tr>`).join('')}</table>` : ''}
${ov.campaigns.length ? `<h2>Campaigns and sales</h2><table>${ov.campaigns.map(c => `<tr><td><b>${esc(c.name)}</b><br><span class="d">${esc(c.window)}</span></td><td>${c.kind === 'measured' ? `${esc(money(c.sales))} from ${c.orders} order(s)` : `During ${esc(money(c.during || 0))} · before ${esc(money(c.before || 0))}`}</td><td>${KIND_TEXT[c.kind]}</td><td class="d">${esc(c.note)}</td></tr>`).join('')}</table>` : ''}
</body></html>`;
  const f = doc0.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  doc0.body.appendChild(f);
  const d = f.contentWindow?.document;
  if (!d) return;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000); }, 250);
}
