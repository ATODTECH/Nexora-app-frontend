import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { AutopilotCard, ChartCard, ChoiceChip } from './AutopilotCard';
import {
  KIND_LABEL, PLATFORMS, VIA_LABEL, checkSite, createSite, deleteSite, health, loadEvents, loadSites, loadStats, platformInfo, retryEvent, rotate, setSigning,
  settingsOf, siteSecrets, successRate, testSite, updateSite, type Links, type Method, type Platform, type Site, type SiteEvent, type SiteSettings, type SiteStat,
} from '../lib/website';

// Website and Digital Channel Integration (blueprint 2.4), the app's screen. Same data and rules as the website's /website.
const TITLE = 'Website and Digital Channel Integration';
type Tab = 'overview' | 'websites' | 'activity' | 'help' | 'autopilot';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'overview', label: 'Overview', icon: 'bar-chart-outline' }, { k: 'websites', label: 'Websites', icon: 'globe-outline' }, { k: 'activity', label: 'Sync history', icon: 'list-outline' },
  { k: 'help', label: 'Troubleshoot', icon: 'help-buoy-outline' }, { k: 'autopilot', label: 'Autopilot', icon: 'rocket-outline' },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ago = (iso: string | null) => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const HEALTH: Record<string, [string, string]> = { Healthy: ['#E6F4ED', '#1E9E6D'], Check: ['#FDF3E1', '#B7791F'], 'Needs attention': ['#FDECEC', '#B42318'], Waiting: ['#F2F4F7', '#5C6B7A'] };
const share = (label: string, value: string) => Share.share({ message: value, title: label }).catch(() => {});

export function WebsiteIntegration({ onBack, flash, goTo, topInset = 0, wide = false }: { onBack: () => void; flash: (t: string) => void; goTo?: (href: string) => void; topInset?: number; wide?: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [sites, setSites] = useState<Site[] | null>(null);
  const [events, setEvents] = useState<SiteEvent[]>([]);
  const [stats, setStats] = useState<SiteStat[]>([]);
  const reload = useCallback(async () => {
    try { const [a, b, c] = await Promise.all([loadSites(), loadEvents(), loadStats(30)]); setSites(a); setEvents(b); setStats(c); } catch (e) { flash((e as Error).message); setSites(x => x ?? []); }
  }, [flash]);
  useEffect(() => {
    let live = true;
    Promise.all([loadSites(), loadEvents(), loadStats(30)]).then(([a, b, c]) => { if (live) { setSites(a); setEvents(b); setStats(c); } }, e => { if (live) { flash((e as Error).message); setSites([]); } });
    return () => { live = false; };
  }, [flash]);
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
        {sites === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 40 }} /> : <>
          {tab === 'overview' && <Overview sites={sites} events={events} stats={stats} go={setTab} />}
          {tab === 'websites' && <Websites sites={sites} events={events} flash={flash} reload={reload} />}
          {tab === 'activity' && <Activity sites={sites} events={events} flash={flash} reload={reload} />}
          {tab === 'help' && <Help sites={sites} events={events} flash={flash} reload={reload} />}
          {tab === 'autopilot' && <AutopilotCard job="website_watch" flash={flash} goTo={goTo} />}
        </>}
      </ScrollView>
    </View>
  );
}

function Overview({ sites, events, stats, go }: { sites: Site[]; events: SiteEvent[]; stats: SiteStat[]; go: (t: Tab) => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 1100) - 64;
  if (!sites.length) return (
    <View style={[s.card, { alignItems: 'center', gap: 6 }]}>
      <Ionicons name="globe-outline" size={36} color="#1E56A0" />
      <Text style={s.bold}>Connect your first website</Text>
      <Text style={[s.small, { textAlign: 'center' }]}>WordPress, WooCommerce, Shopify, Wix, Squarespace, Webflow or your own site. Enquiries become leads, orders land in Orders, products and stock stay in step.</Text>
      <Pressable onPress={() => go('websites')} style={s.btn}><Text style={s.btnText}>Connect a website</Text></Pressable>
    </View>
  );
  const days: string[] = []; for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const on = (k: 'views' | 'enquiries' | 'orders' | 'revenue', d: string) => stats.filter(x => x.day === d).reduce((a, x) => a + Number(x[k] || 0), 0);
  const total = (k: 'views' | 'enquiries' | 'orders' | 'revenue', from = 0) => days.slice(from).reduce((a, d) => a + on(k, d), 0);
  const sources: Record<string, number> = {};
  for (const x of stats) for (const [k, v] of Object.entries(x.sources ?? {})) sources[k] = (sources[k] ?? 0) + Number(v);
  const rate = successRate(events);
  const tiles = [['Visits · 7 days', total('views', 23).toLocaleString()], ['Enquiries · 30 days', total('enquiries').toLocaleString()], ['Website orders · 30 days', total('orders').toLocaleString()], ['Sync success · 7 days', rate === null ? '—' : `${rate}%`]];
  return (
    <>
      <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>{tiles.map(([l, v]) => <View key={l} style={s.kpi}><Text style={s.tiny}>{l}</Text><Text style={{ fontSize: 20, fontWeight: '800', color: '#0B1220' }}>{v}</Text></View>)}</View>
      <ChartCard w={w} cur="" c={{ type: 'line', title: 'Visits, enquiries and orders · 30 days', unit: 'count', x: days.map(d => `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`), series: [{ name: 'Visits', values: days.map(d => on('views', d)) }, { name: 'Enquiries', values: days.map(d => on('enquiries', d)) }, { name: 'Orders', values: days.map(d => on('orders', d)) }] }} />
      <ChartCard w={w} cur="" c={{ type: 'funnel', title: 'From visit to order · 30 days', steps: [{ label: 'Visits', value: total('views') }, { label: 'Enquiries', value: total('enquiries') }, { label: 'Orders', value: total('orders') }] }} />
      {!!Object.keys(sources).length && <ChartCard w={w} cur="" c={{ type: 'donut', title: 'Where visitors come from', items: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })) }} />}
      <ChartCard w={w} cur="" c={{ type: 'bar', title: 'Health of each website (out of 100)', unit: 'count', items: sites.map(x => ({ label: x.name.slice(0, 14), value: health(x, events).score })) }} />
      <View style={s.card}>
        <View style={s.row}><Text style={[s.bold, { flex: 1 }]}>Latest activity</Text><Pressable onPress={() => go('activity')}><Text style={s.link}>See all</Text></Pressable></View>
        {events.filter(e => e.kind !== 'page_view').slice(0, 5).map(e => <EventRow key={e.id} e={e} site={sites.find(x => x.id === e.connection_id)} />)}
      </View>
    </>
  );
}

function EventRow({ e, site, onRetry, busy }: { e: SiteEvent; site?: Site; onRetry?: () => void; busy?: boolean }) {
  const icon = e.status === 'failed' ? ['close-circle', '#B42318'] : e.status === 'processed' ? ['checkmark-circle', '#1E9E6D'] : ['alert-circle', '#8A97A6'];
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
      <Ionicons name={icon[0] as any} size={18} color={icon[1]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.small, { color: '#0B1220', fontWeight: '600' }]}>{e.title}</Text>
        <Text style={s.tiny}>{KIND_LABEL[e.kind] ?? e.kind} · {VIA_LABEL[e.via] ?? e.via}{site ? ` · ${site.name}` : ''} · {ago(e.created_at)}</Text>
        {!!e.detail && <Text style={s.tiny} numberOfLines={2}>{e.detail}</Text>}
        {!!e.error && <Text style={{ fontSize: 12, color: '#B42318' }}>{e.error}</Text>}
      </View>
      {onRetry && <Pressable onPress={onRetry} disabled={busy}>{busy ? <ActivityIndicator color="#1E56A0" /> : <Text style={s.link}>Retry</Text>}</Pressable>}
    </View>
  );
}

const STEPS: Record<string, string> = {
  wordpress: 'Install the free plugin “WPCode”, open Code Snippets → Header & Footer, paste the website code into Header and Save.',
  woocommerce: 'WooCommerce → Settings → Advanced → Webhooks → Add webhook for “Order created”, “Order updated”, “Product created/updated” and “Customer created”, with the delivery URL and secret below. Add the website code with WPCode for enquiry forms.',
  shopify: 'Settings → Notifications → Webhooks → Create webhook for “Order creation”, “Order update”, “Product update”, “Customer creation” (JSON, URL below). Paste Shopify’s signing key into Nexora below.',
  wix: 'Settings → Custom code → Add custom code: paste, All pages, Head, Apply.',
  squarespace: 'Settings → Advanced → Code injection → Header: paste and Save.',
  webflow: 'Site settings → Custom code → Head code: paste, Save, Publish.',
  custom: 'Paste the website code before </head> on every page, publish, then press Check website.',
  other: 'Send events to the API address with your secret key, or send signed webhooks. Use your order number in data.number.',
};

function Websites({ sites, events, flash, reload }: { sites: Site[]; events: SiteEvent[]; flash: (t: string) => void; reload: () => Promise<void> }) {
  const [wiz, setWiz] = useState<{ platform: Platform; name: string; url: string; method: Method } | null>(null);
  const [setup, setSetup] = useState<{ site: Site; links: Links; secret: string; apiKey?: string } | null>(null);
  const [edit, setEdit] = useState<{ site: Site; settings: SiteSettings; name: string; url: string } | null>(null);
  const [busy, setBusy] = useState('');
  const act = async (k: string, fn: () => Promise<unknown>, ok?: string) => { setBusy(k); try { await fn(); if (ok) flash(ok); await reload(); } catch (e) { flash((e as Error).message); } setBusy(''); };
  return (
    <>
      <Pressable onPress={() => setWiz({ platform: 'custom', name: '', url: '', method: 'script' })} style={s.btn}><Ionicons name="add" size={18} color="#FFF" /><Text style={s.btnText}>Connect a website</Text></Pressable>
      {wiz && (
        <View style={s.card}>
          <Text style={s.bold}>What is your website built with?</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6, marginTop: 8 }]}>{PLATFORMS.map(p => <ChoiceChip key={p.k} on={wiz.platform === p.k} label={p.name} onPress={() => setWiz({ ...wiz, platform: p.k, method: p.method })} />)}</View>
          <Text style={s.tiny}>{platformInfo(wiz.platform).note}</Text>
          <Text style={s.label}>Name</Text><TextInput value={wiz.name} onChangeText={t => setWiz({ ...wiz, name: t })} placeholder="e.g. Jekamix online store" placeholderTextColor="#A5AFBB" style={s.input} />
          <Text style={s.label}>Address</Text><TextInput value={wiz.url} onChangeText={t => setWiz({ ...wiz, url: t })} autoCapitalize="none" keyboardType="url" placeholder="https://yourshop.com" placeholderTextColor="#A5AFBB" style={s.input} />
          <Text style={s.label}>How it connects</Text>
          <View style={[s.row, { gap: 6 }]}>{(['script', 'webhook', 'api'] as Method[]).map(m => <ChoiceChip key={m} on={wiz.method === m} label={m === 'script' ? 'Website code' : m === 'webhook' ? 'Webhooks' : 'API'} onPress={() => setWiz({ ...wiz, method: m })} />)}</View>
          <View style={[s.row, { gap: 8, marginTop: 12 }]}>
            <Pressable onPress={() => setWiz(null)} style={[s.btn, s.btnSoft, { flex: 1 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>Cancel</Text></Pressable>
            <Pressable disabled={!wiz.name.trim() || busy === 'create'} onPress={() => act('create', async () => { const r = await createSite(wiz); setWiz(null); setSetup({ site: r.connection, links: r.links, secret: r.signing_secret, apiKey: r.api_key }); }, 'Website connected')} style={[s.btn, { flex: 1 }]}><Text style={s.btnText}>{busy === 'create' ? 'Connecting…' : 'Connect'}</Text></Pressable>
          </View>
        </View>
      )}
      {setup && (
        <View style={[s.card, { borderColor: '#1E56A0' }]}>
          <View style={s.row}><Text style={[s.bold, { flex: 1 }]}>Set up {setup.site.name}</Text><Pressable onPress={() => setSetup(null)}><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable></View>
          <Text style={[s.small, { marginTop: 4 }]}>{STEPS[setup.site.platform] ?? STEPS.custom}</Text>
          {([['Website code', setup.links.script], ['Webhook delivery URL', setup.links.webhook_url], ['Signing secret', setup.secret], ['API address', setup.links.api_url], ...(setup.apiKey ? [['API key (shown once)', setup.apiKey]] : [])] as [string, string][]).map(([l, v]) => (
            <Pressable key={l} onPress={() => share(l, v)} style={s.copy}><View style={{ flex: 1 }}><Text style={s.tiny}>{l}</Text><Text style={{ fontSize: 12, color: '#0B1220' }} numberOfLines={2}>{/secret|key/i.test(l) ? `${v.slice(0, 8)}…` : v}</Text></View><Ionicons name="share-outline" size={18} color="#1E56A0" /></Pressable>
          ))}
          {setup.site.platform === 'shopify' && <ShopifyKey onSave={k => act('shop', () => setSigning(setup.site.id, k), 'Shopify key saved')} />}
          <Text style={s.tiny}>Tap a line to copy or send it (for example to your web designer).</Text>
        </View>
      )}
      {edit && (
        <View style={s.card}>
          <Text style={s.bold}>{edit.site.name} settings</Text>
          <Text style={s.label}>Name</Text><TextInput value={edit.name} onChangeText={t => setEdit({ ...edit, name: t })} style={s.input} />
          <Text style={s.label}>Address</Text><TextInput value={edit.url} onChangeText={t => setEdit({ ...edit, url: t })} autoCapitalize="none" style={s.input} />
          {([['enquiries', 'Enquiries → leads in Customers'], ['alert_enquiries', 'Tell me about each enquiry'], ['auto_forms', 'Pick up forms automatically'], ['orders', 'Orders and their updates'], ['stock_from_orders', 'Take stock from website orders'], ['products', 'Products, prices and stock'], ['customers', 'Customer accounts'], ['page_views', 'Visits and sources']] as [keyof SiteSettings, string][]).map(([k, t]) => (
            <View key={k} style={[s.row, { paddingVertical: 4 }]}><Text style={[s.small, { flex: 1 }]}>{t}</Text><Switch value={!!edit.settings[k]} onValueChange={v => setEdit({ ...edit, settings: { ...edit.settings, [k]: v } })} /></View>
          ))}
          <View style={[s.row, { gap: 6, marginTop: 4 }]}><ChoiceChip on={edit.settings.product_mode === 'review'} label="New products: I check them" onPress={() => setEdit({ ...edit, settings: { ...edit.settings, product_mode: 'review' } })} /><ChoiceChip on={edit.settings.product_mode === 'auto'} label="Add straight away" onPress={() => setEdit({ ...edit, settings: { ...edit.settings, product_mode: 'auto' } })} /></View>
          <View style={[s.row, { gap: 8, marginTop: 12 }]}>
            <Pressable onPress={() => setEdit(null)} style={[s.btn, s.btnSoft, { flex: 1 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>Cancel</Text></Pressable>
            <Pressable onPress={() => act('edit', async () => { await updateSite(edit.site.id, { name: edit.name.trim(), url: edit.url.trim(), settings: edit.settings }); setEdit(null); }, 'Settings saved')} style={[s.btn, { flex: 1 }]}><Text style={s.btnText}>Save</Text></Pressable>
          </View>
        </View>
      )}
      {!sites.length ? <View style={s.card}><Text style={s.small}>No websites yet.</Text></View> : sites.map(x => {
        const h = health(x, events), [bg, fg] = HEALTH[x.status === 'paused' ? 'Waiting' : h.label];
        return (
          <View key={x.id} style={s.card}>
            <View style={[s.row, { gap: 8 }]}>
              <Ionicons name="globe-outline" size={22} color="#1E56A0" />
              <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{x.name}</Text><Text style={s.tiny} numberOfLines={1}>{platformInfo(x.platform).name} · {x.url.replace(/^https?:\/\//, '') || 'no address'} · {ago(x.last_event_at)}</Text></View>
              <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>{x.status === 'paused' ? 'Paused' : `${h.label}${h.label !== 'Waiting' ? ` ${h.score}` : ''}`}</Text></View>
            </View>
            {!!h.why.length && <Text style={[s.tiny, { color: '#8A5A00', marginTop: 6 }]}>{h.why.join(' ')}</Text>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              <ChoiceChip on={false} label="Setup" onPress={() => act(`setup${x.id}`, async () => { const r = await siteSecrets(x.id); setSetup({ site: x, links: r.links, secret: r.signing_secret }); })} />
              <ChoiceChip on={false} label={busy === `check${x.id}` ? 'Checking…' : 'Check website'} onPress={() => act(`check${x.id}`, async () => { const r = await checkSite(x.id); flash(`${r.title}. ${r.message}`); })} />
              <ChoiceChip on={false} label={busy === `test${x.id}` ? 'Testing…' : 'Send a test'} onPress={() => act(`test${x.id}`, async () => { const r = await testSite(x.id); flash(r.ok ? 'Connection test passed' : `Needs fixing: ${r.results.find(y => y.status === 'failed')?.message ?? ''}`); })} />
              <ChoiceChip on={false} label="Settings" onPress={() => setEdit({ site: x, settings: settingsOf(x), name: x.name, url: x.url })} />
              <ChoiceChip on={false} label={x.status === 'paused' ? 'Resume' : 'Pause'} onPress={() => act(`p${x.id}`, () => updateSite(x.id, { status: x.status === 'paused' ? 'active' : 'paused' }), x.status === 'paused' ? 'Resumed' : 'Paused')} />
              <ChoiceChip on={false} label="New secret" onPress={() => act(`r${x.id}`, async () => { const r = await rotate(x.id, 'signing'); if (r.signing_secret) share('Signing secret', r.signing_secret); }, 'New signing secret made')} />
              <ChoiceChip on={false} label="Remove" onPress={() => Alert.alert(`Remove ${x.name}?`, 'Its sync history and visit counts are deleted. Orders, customers and products already saved stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => act(`d${x.id}`, () => deleteSite(x.id), 'Website removed') }])} />
            </ScrollView>
          </View>
        );
      })}
    </>
  );
}
function ShopifyKey({ onSave }: { onSave: (k: string) => void }) {
  const [k, setK] = useState('');
  return <View style={[s.row, { gap: 6, marginTop: 8 }]}><TextInput value={k} onChangeText={setK} placeholder="Shopify signing key" placeholderTextColor="#A5AFBB" autoCapitalize="none" style={[s.input, { flex: 1 }]} /><Pressable disabled={k.trim().length < 16} onPress={() => { onSave(k.trim()); setK(''); }} style={[s.btn, { height: 40 }]}><Text style={s.btnText}>Save</Text></Pressable></View>;
}

function Activity({ sites, events, flash, reload }: { sites: Site[]; events: SiteEvent[]; flash: (t: string) => void; reload: () => Promise<void> }) {
  const [f, setF] = useState<'all' | 'failed' | 'processed'>('all');
  const [busy, setBusy] = useState('');
  const shown = events.filter(e => f === 'all' || e.status === f);
  return (
    <View style={s.card}>
      <View style={[s.row, { gap: 6 }]}>{(['all', 'failed', 'processed'] as const).map(k => <ChoiceChip key={k} on={f === k} label={k === 'all' ? 'All' : k === 'failed' ? 'Failed' : 'Saved'} onPress={() => setF(k)} />)}</View>
      {!shown.length ? <Text style={[s.small, { marginTop: 8 }]}>Nothing here yet.</Text> : shown.slice(0, 150).map(e => (
        <EventRow key={e.id} e={e} site={sites.find(x => x.id === e.connection_id)} busy={busy === e.id}
          onRetry={e.status === 'failed' && !!e.payload && ['enquiry', 'order', 'order_update', 'product', 'customer'].includes(e.kind) ? async () => { setBusy(e.id); try { const r = await retryEvent(e.id); flash(r.status === 'failed' ? `Still failing: ${r.message}` : `Fixed: ${r.message}`); await reload(); } catch (x) { flash((x as Error).message); } setBusy(''); } : undefined} />
      ))}
    </View>
  );
}

function Help({ sites, events, flash, reload }: { sites: Site[]; events: SiteEvent[]; flash: (t: string) => void; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const fixes = [
    ['Enquiries don’t arrive', 'The website code must be on the page with the form, and the form needs an email or phone field. Press Check website.'],
    ['“Signature didn’t match”', 'Copy the signing secret from Setup into the webhook’s Secret field again (Shopify: paste Shopify’s key into Nexora).'],
    ['Stock doesn’t change', 'Stock is taken for products that match by SKU or exact name. Add the SKU in Products.'],
    ['New products don’t show', 'They wait for you in Products (Need review) unless Settings says “Add straight away”.'],
    ['Visits stay at zero', 'Visits come from the website code only: put it in the Head of every page and publish.'],
  ];
  return (
    <>
      {sites.map(x => {
        const ev = events.filter(e => e.connection_id === x.id);
        const check = ev.find(e => e.kind === 'check' && /Website check/.test(e.title));
        const items: [boolean | null, string][] = [
          [!!x.url, x.url ? `Address saved: ${x.url}` : 'No website address saved'],
          [check ? check.status === 'processed' : null, check ? `${check.title} (${ago(check.created_at)})` : 'Website not checked yet'],
          [x.method !== 'script' ? null : !!x.script_seen_at, x.method !== 'script' ? 'Website code not needed for this connection' : x.script_seen_at ? `Code working (seen ${ago(x.script_seen_at)})` : 'Code not seen yet'],
          [x.last_event_at ? Date.now() - new Date(x.last_event_at).getTime() < 7 * 86400000 : false, `Last delivery: ${ago(x.last_event_at)}`],
          [x.status === 'active', x.status === 'active' ? 'Connection is on' : 'Connection is paused'],
        ];
        return (
          <View key={x.id} style={s.card}>
            <Text style={s.bold}>{x.name} · health {health(x, events).score}/100</Text>
            {items.map(([ok, t]) => <View key={t} style={[s.row, { gap: 6, marginTop: 6 }]}><Ionicons name={ok === null ? 'alert-circle' : ok ? 'checkmark-circle' : 'close-circle'} size={16} color={ok === null ? '#8A97A6' : ok ? '#1E9E6D' : '#B42318'} /><Text style={[s.small, { flex: 1 }]}>{t}</Text></View>)}
            <Pressable onPress={async () => { setBusy(x.id); try { const r = await checkSite(x.id); flash(`${r.title}. ${r.message}`); await reload(); } catch (e) { flash((e as Error).message); } setBusy(''); }} style={[s.btn, s.btnSoft, { marginTop: 10 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>{busy === x.id ? 'Checking…' : 'Check website now'}</Text></Pressable>
          </View>
        );
      })}
      <View style={s.card}><Text style={s.bold}>Common problems and fixes</Text>{fixes.map(([q, a]) => <View key={q} style={{ marginTop: 8 }}><Text style={[s.small, { fontWeight: '700', color: '#0B1220' }]}>{q}</Text><Text style={s.small}>{a}</Text></View>)}</View>
      <Pressable onPress={() => Linking.openURL('https://nexorabusinessai.com/website?tab=help').catch(() => {})}><Text style={[s.link, { textAlign: 'center' }]}>Open the full guide on the website</Text></Pressable>
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
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EF', padding: 12 },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  label: { marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  link: { fontSize: 13, fontWeight: '700', color: '#1E56A0' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 16 },
  btnSoft: { backgroundColor: '#EEF4FC' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, marginTop: 8 },
});
