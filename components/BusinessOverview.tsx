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
};

export function BusinessOverview({ businessName, bizCurrency, width, canExport, callFn, onGo, onAsk, onDaily, onExported }: Props) {
  const [range, setRange] = useState<RangeDays>(30);
  const [ov, setOv] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [openDef, setOpenDef] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const tileW = (width - 36 - (cols - 1) * 10) / cols;
  const areas = (Object.keys(AREA_TEXT) as Area[]).filter(a => ov?.kpis.some(k => k.area === a));
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
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: GRID, padding: 16 }} accessibilityLabel="Business overview">
      <Text style={{ fontSize: 17, fontWeight: '900', color: INK }}>Business overview</Text>
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
        <View style={{ opacity: busy ? 0.6 : 1 }}>
          {areas.length > 1 && (
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {(['all', ...areas] as (Area | 'all')[]).map(a => (
                <Pressable key={a} onPress={() => setArea(a)} accessibilityRole="tab" accessibilityState={{ selected: area === a }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', borderWidth: 1, borderColor: area === a ? BLUE : GRID, backgroundColor: area === a ? '#EAF1FB' : '#FFFFFF' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: area === a ? BLUE : '#334155' }}>{a === 'all' ? 'Everything' : AREA_TEXT[a]}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {(area === 'all' ? areas : [area]).map(a => (
            <View key={a} style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, color: FAINT, marginBottom: 8 }}>{AREA_TEXT[a].toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ov.kpis.filter(k => k.area === a).map(k => <Tile key={k.key} k={k} ov={ov} money={money} w={tileW} open={openDef === k.key} onInfo={() => setOpenDef(openDef === k.key ? null : k.key)} onGo={onGo} />)}
              </View>
            </View>
          ))}
          {!!ov.otherCurrency && <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>{`${ov.otherCurrency} order${ov.otherCurrency === 1 ? '' : 's'} in another currency ${ov.otherCurrency === 1 ? 'is' : 'are'} not added to these ${ov.currency} totals.`}</Text>}

          <View style={{ flexDirection: width >= 860 ? 'row' : 'column', gap: 12, marginTop: 16 }}>
            <View style={{ flex: width >= 860 ? 1 : undefined, borderRadius: 16, borderWidth: 1, borderColor: GRID, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: INK }}>Unusual changes</Text><KindBadge k="measured" /></View>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 10 }}>Found in your records, with a next step</Text>
              {!ov.anomalies.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={16} color={GOOD} /><Text style={{ fontSize: 13, color: MUTED }}>Nothing unusual in this period.</Text></View>
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
            <View style={{ flex: width >= 860 ? 1 : undefined, borderRadius: 16, borderWidth: 1, borderColor: GRID, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: INK }}>Campaigns and sales</Text>
                <Pressable onPress={() => onGo('/campaigns')} hitSlop={6}><Text style={{ fontSize: 12.5, fontWeight: '700', color: BLUE }}>Campaigns</Text></Pressable>
              </View>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 10 }}>Which campaigns brought orders in this period</Text>
              {!ov.campaigns.length ? <Text style={{ fontSize: 13, color: MUTED }}>No campaign was running in this period. Campaigns with a tracked link or a discount code show their orders here.</Text>
                : ov.campaigns.map(c => (
                  <View key={c.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: GRID, padding: 12, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: INK }}>{c.name}</Text><KindBadge k={c.kind} /></View>
                    <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>{`${c.window}${c.channel ? ` · ${c.channel}` : ''}`}</Text>
                    <Text style={{ fontSize: 13, color: INK, marginTop: 6 }}>{c.kind === 'measured' ? `${money(c.sales)} from ${c.orders} order${c.orders === 1 ? '' : 's'}` : `During: ${money(c.during || 0)} · Same days before: ${money(c.before || 0)}`}</Text>
                    <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 16 }}>{c.note}</Text>
                  </View>
                ))}
            </View>
          </View>
          <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>{`Worked out ${ov.generated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} from records saved in Nexora. Today counts up to now.`}</Text>
        </View>
      )}
    </View>
  );
}

function Tile({ k, ov, money, w, open, onInfo, onGo }: { k: Kpi; ov: Overview; money: (v: number) => string; w: number; open: boolean; onInfo: () => void; onGo: (href: string) => void }) {
  const ch = changePct(k.value, k.prev);
  const good = ch === null ? null : k.lowerIsBetter ? ch <= 0 : ch >= 0;
  const weak = k.few || (ch !== null && Math.abs(ch) < 5);
  return (
    <View style={{ width: w, borderRadius: 14, borderWidth: 1, borderColor: GRID, backgroundColor: '#F8FAFC', padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: MUTED, lineHeight: 16 }}>{k.label}</Text>
        <Pressable onPress={onInfo} hitSlop={8} accessibilityLabel={`What ${k.label} means`} accessibilityState={{ expanded: open }}><Ionicons name="information-circle-outline" size={17} color={open ? BLUE : FAINT} /></Pressable>
      </View>
      <Pressable onPress={() => onGo(k.href)} accessibilityRole="link"><Text numberOfLines={1} style={{ fontSize: 20, fontWeight: '900', color: INK, marginTop: 6 }}>{fmtValue(k, money)}</Text></Pressable>
      <Text style={{ fontSize: 11.5, marginTop: 2, color: k.snapshot || ch === null || weak ? FAINT : good ? GOOD : BAD, fontWeight: k.snapshot || ch === null ? '400' : '700' }}>
        {k.snapshot ? 'Counted today' : ch === null ? (k.prev === 0 && (k.value ?? 0) > 0 ? 'New this period' : 'Nothing to compare yet')
          : `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%${k.few ? ' · few orders, not a trend' : ` vs ${fmtValue({ fmt: k.fmt, value: k.prev }, money)}`}`}
      </Text>
      {open && <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#334155', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, marginTop: 8 }}>{`${k.def}\n${k.snapshot ? 'Counted today.' : `${fmtDate(ov.from)} – ${fmtDate(ov.to)}.`}`}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><KindBadge k={k.kind} /><Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: FAINT }}>{`From: ${k.source}`}</Text></View>
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
