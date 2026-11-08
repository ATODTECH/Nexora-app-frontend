/* eslint-disable @typescript-eslint/no-explicit-any -- rows come from several tables and the shop server */
import { supabase } from './supabase';

// Business Insights and Analytics (capability 2.11). One overview built from the records Nexora already keeps:
// orders (2.10), customers and leads (2.7), stock (2.9), campaigns and posts (2.5, 2.3), the AI shop link (2.8)
// and connected websites (2.4). Every figure says what it means, which dates it covers and where it comes from,
// and is marked Measured (counted from records) or Estimate (worked out, not counted). AI views are marked apart.

type Channel = 'shop' | 'website' | 'chat' | 'manual';
type Order = {
  id: string; created_at: string; status: string; payment_status?: string; total: number; amount_paid?: number; refunded_amount?: number; currency?: string;
  source?: string; src?: string | null; coupon_code?: string | null; customer_id?: string | null; customer_name?: string; customer_phone?: string;
};
const CHANNEL_TEXT: Record<Channel, string> = { shop: 'Shop link', website: 'Website', chat: 'Chats and calls', manual: 'In person' };
const channelOf = (o: Order): Channel => {
  const s = (o.source || '').toLowerCase();
  return s === 'shop' ? 'shop' : s === 'website' || s === 'api' || s === 'webhook' ? 'website' : ['whatsapp', 'instagram', 'facebook', 'chat', 'messenger', 'sms', 'email', 'call', 'phone'].includes(s) ? 'chat' : 'manual';
};
/** The money that really came in: paid orders, less refunds, cancelled orders left out (same rule as Orders). */
const takings = (o: Order) => o.status === 'cancelled' && !Number(o.amount_paid) ? 0
  : ['paid', 'partially_refunded', 'refunded'].includes(o.payment_status || '') ? Math.max(0, Number(o.amount_paid || o.total || 0) - Number(o.refunded_amount || 0)) : 0;

export type RangeDays = 7 | 30 | 90;
export type Kind = 'measured' | 'estimate' | 'ai';
export type Area = 'sales' | 'customers' | 'stock' | 'marketing' | 'online';
export const AREA_TEXT: Record<Area, string> = { sales: 'Sales and orders', customers: 'Leads and customers', stock: 'Products and stock', marketing: 'Marketing', online: 'Shop link and website' };
export const KIND_TEXT: Record<Kind, string> = { measured: 'Measured', estimate: 'Estimate', ai: 'AI view' };
export const KIND_HELP: Record<Kind, string> = {
  measured: 'Counted from records saved in Nexora.',
  estimate: 'Worked out from patterns. A guide, not a result.',
  ai: "Nexora's reading of the numbers. Check it against the measured figures.",
};

export type Kpi = {
  key: string; area: Area; label: string; value: number | null; prev: number | null; fmt: 'money' | 'count' | 'pct';
  kind: Kind; def: string; source: string; href: string; snapshot?: boolean; lowerIsBetter?: boolean; few?: boolean;
};
export type Anomaly = { key: string; tone: 'good' | 'warn' | 'bad'; title: string; detail: string; action: { label: string; href: string }; ask: string };
export type CampaignResult = {
  id: string; name: string; channel: string; window: string; orders: number; sales: number; kind: Kind; note: string;
  before?: number; during?: number;
};
export type Overview = {
  range: RangeDays; from: Date; to: Date; prevFrom: Date; currency: string; otherCurrency: number;
  kpis: Kpi[]; daily: { day: string; revenue: number; prev: number; orders: number }[]; channels: { ch: Channel; label: string; orders: number; sales: number }[];
  anomalies: Anomaly[]; campaigns: CampaignResult[]; generated: Date; sources: Record<string, boolean>;
};

const DAY = 86400000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
export const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const rangeText = (o: Pick<Overview, 'from' | 'to'>) => `${fmtDate(o.from)} – ${fmtDate(o.to)}`;
export const changePct = (v: number | null, p: number | null) => (v === null || p === null || p <= 0 ? null : Math.round(((v - p) / p) * 100));
const SALE_REASONS = ['shop_order', 'manual_order', 'website_order'];

type Raw = {
  orders: Order[]; contacts: { segment: string; created_at: string; customer_since: string | null }[]; convs: { created_at: string; last_message_at: string | null }[];
  deals: { stage: string; value: number | null; closed_at: string | null }[]; restock: { level: string; sold_30d: number; name: string }[];
  moves: { change: number; reason: string; created_at: string }[]; campaigns: any[]; posts: { published_at: string | null; status: string }[];
  shopNow: any; shopBoth: any; sites: { status: string }[]; webEvents: { kind: string; status: string; created_at: string }[]; bizCurrency: string;
};

/** Reads everything the overview needs for the chosen period and the period before it. Missing parts are left empty. */
export async function loadOverview(range: RangeDays, bizCurrency: string, callFn: (name: string, body: Record<string, unknown>) => Promise<any>): Promise<Overview> {
  const now = Date.now();
  const from = startOfDay(now - (range - 1) * DAY), prevFrom = new Date(from.getTime() - range * DAY);
  const since = prevFrom.toISOString();
  const safe = async <T,>(p: PromiseLike<{ data: any; error: any }>, fallback: T): Promise<{ v: T; ok: boolean }> => {
    try { const r = await p; return r.error ? { v: fallback, ok: false } : { v: (r.data ?? fallback) as T, ok: true }; } catch { return { v: fallback, ok: false }; }
  };
  const fn = async (days: number) => { try { return await callFn('nexora-shop', { action: 'stats', days }); } catch { return null; } };
  const [o, c, cv, d, rs, mv, cp, ps, st, we, s1, s2] = await Promise.all([
    safe(supabase.from('orders').select('id,created_at,status,payment_status,total,amount_paid,refunded_amount,currency,source,src,coupon_code,customer_id,customer_name,customer_phone').gte('created_at', since).order('created_at').limit(5000), [] as Order[]),
    safe(supabase.rpc('crm_contacts'), [] as Raw['contacts']),
    safe(supabase.from('conversations').select('created_at,last_message_at').gte('last_message_at', since).limit(5000), [] as Raw['convs']),
    safe(supabase.from('crm_deals').select('stage,value,closed_at').limit(2000), [] as Raw['deals']),
    safe(supabase.rpc('inv_restock_list'), [] as Raw['restock']),
    safe(supabase.from('stock_movements').select('change,reason,created_at').gte('created_at', since).in('reason', SALE_REASONS).limit(10000), [] as Raw['moves']),
    safe(supabase.from('campaigns').select('id,name,channel,status,src,coupon_code,starts_at,ends_at,published_at,created_at').limit(500), [] as any[]),
    safe(supabase.from('social_post_targets').select('published_at,status').gte('published_at', since).limit(5000), [] as Raw['posts']),
    safe(supabase.from('website_connections').select('status'), [] as Raw['sites']),
    safe(supabase.from('website_events').select('kind,status,created_at').gte('created_at', since).limit(10000), [] as Raw['webEvents']),
    fn(range), fn(range * 2),
  ]);
  const raw: Raw = {
    orders: o.v, contacts: c.v, convs: cv.v, deals: d.v, restock: rs.v, moves: mv.v, campaigns: cp.v, posts: ps.v, sites: st.v, webEvents: we.v,
    shopNow: s1, shopBoth: s2, bizCurrency,
  };
  const out = buildOverview(raw, range, now);
  out.sources = { orders: o.ok, customers: c.ok, stock: rs.ok, campaigns: cp.ok, posts: ps.ok, shop: !!s1?.totals, website: st.ok && st.v.length > 0 };
  return out;
}

/** Works out the overview from records. Kept free of screens so the phone app uses the same rules. */
export function buildOverview(r: Raw, range: RangeDays, now = Date.now()): Overview {
  const from = startOfDay(now - (range - 1) * DAY), prevFrom = new Date(from.getTime() - range * DAY), to = new Date(now);
  const F = from.getTime(), P = prevFrom.getTime();
  const inNow = (t: string | null | undefined) => !!t && new Date(t).getTime() >= F && new Date(t).getTime() <= now;
  const inPrev = (t: string | null | undefined) => !!t && new Date(t).getTime() >= P && new Date(t).getTime() < F;

  // Money in another currency is never added in; orders saved without a currency count as the main one.
  const count: Record<string, number> = {};
  for (const o of r.orders) if (o.currency) count[o.currency] = (count[o.currency] || 0) + 1;
  const currency = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || r.bizCurrency || 'NGN';
  const same = r.orders.filter(o => !o.currency || o.currency === currency);
  const otherCurrency = r.orders.filter(o => inNow(o.created_at) && o.currency && o.currency !== currency).length;
  const live = same.filter(o => o.status !== 'cancelled');
  const cur = live.filter(o => inNow(o.created_at)), prev = live.filter(o => inPrev(o.created_at));
  const sum = (l: Order[], f: (o: Order) => number) => l.reduce((n, o) => n + f(o), 0);
  const paidN = (l: Order[]) => l.filter(o => takings(o) > 0).length;
  const unpaid = (l: Order[]) => sum(l.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'pending'), o => Number(o.total || 0));
  const cancelled = (from: (t: string) => boolean) => same.filter(o => o.status === 'cancelled' && from(o.created_at)).length;
  const buyer = (o: Order) => o.customer_id || (o.customer_phone || '').replace(/\D/g, '') || (o.customer_name || '').trim().toLowerCase();
  const buyers = (l: Order[]) => new Set(l.map(buyer).filter(Boolean)).size;
  const per = `the last ${range} days`;

  const kpis: Kpi[] = [];
  const add = (k: Kpi) => kpis.push({ ...k, few: k.few ?? false });
  const salesNow = sum(cur, takings), salesPrev = sum(prev, takings);
  add({ key: 'sales', area: 'sales', label: 'Money received', value: salesNow, prev: salesPrev, fmt: 'money', kind: 'measured', href: '/orders?filter=All', source: 'Orders',
    def: `Paid orders placed in ${per}, less refunds. Cancelled and unpaid orders are not counted.`, few: cur.length + prev.length < 6 });
  add({ key: 'orders', area: 'sales', label: 'Orders', value: cur.length, prev: prev.length, fmt: 'count', kind: 'measured', href: '/orders?filter=All', source: 'Orders',
    def: `Orders placed in ${per} from every channel, cancelled ones left out.`, few: cur.length + prev.length < 6 });
  add({ key: 'avg', area: 'sales', label: 'Average paid order', value: paidN(cur) ? Math.round(salesNow / paidN(cur)) : null, prev: paidN(prev) ? Math.round(salesPrev / paidN(prev)) : null, fmt: 'money', kind: 'measured', href: '/orders?filter=All', source: 'Orders',
    def: 'Money received divided by the number of paid orders.', few: paidN(cur) + paidN(prev) < 6 });
  add({ key: 'unpaid', area: 'sales', label: 'Waiting to be paid', value: unpaid(cur), prev: unpaid(prev), fmt: 'money', kind: 'measured', href: '/orders?filter=Unpaid', source: 'Orders', lowerIsBetter: true,
    def: `Orders placed in ${per} that are still marked unpaid or being checked.` });
  add({ key: 'cancel', area: 'sales', label: 'Cancelled orders', value: cancelled(inNow), prev: cancelled(inPrev), fmt: 'count', kind: 'measured', href: '/orders?filter=Cancelled', source: 'Orders', lowerIsBetter: true,
    def: `Orders placed in ${per} that were cancelled.` });

  const leadSeg = ['Lead', 'Contacted', 'Qualified'];
  const newContacts = (f: (t: string) => boolean) => r.contacts.filter(c => f(c.created_at)).length;
  const newCustomers = (f: (t: string) => boolean) => r.contacts.filter(c => c.customer_since && f(`${c.customer_since}T12:00:00`)).length;
  add({ key: 'buyers', area: 'customers', label: 'Customers who bought', value: buyers(cur), prev: buyers(prev), fmt: 'count', kind: 'measured', href: '/customers', source: 'Orders',
    def: `Different people with at least one order in ${per}.` });
  add({ key: 'newcust', area: 'customers', label: 'New customers', value: newCustomers(inNow), prev: newCustomers(inPrev), fmt: 'count', kind: 'measured', href: '/customers', source: 'Customers (CRM)',
    def: `Customers whose first purchase date falls in ${per}.` });
  add({ key: 'newleads', area: 'customers', label: 'New contacts and leads', value: newContacts(inNow), prev: newContacts(inPrev), fmt: 'count', kind: 'measured', href: '/leads', source: 'Customers (CRM)',
    def: `People added to Customers or Leads in ${per}, by you, a chat, the shop link or a website form.` });
  add({ key: 'openleads', area: 'customers', label: 'Open leads now', value: r.contacts.filter(c => leadSeg.includes(c.segment)).length, prev: null, fmt: 'count', kind: 'measured', href: '/leads', source: 'Customers (CRM)', snapshot: true,
    def: 'Leads not yet turned into customers (Lead, Contacted or Qualified), counted today.' });
  add({ key: 'chats', area: 'customers', label: 'Active conversations', value: r.convs.filter(c => inNow(c.last_message_at)).length, prev: r.convs.filter(c => inPrev(c.last_message_at)).length, fmt: 'count', kind: 'measured', href: '/inbox', source: 'Inbox',
    def: `Chats with a message in ${per} on your connected channels.` });
  const won = (f: (t: string) => boolean) => r.deals.filter(x => x.stage === 'won' && f(x.closed_at || '')).reduce((n, x) => n + Number(x.value || 0), 0);
  if (r.deals.length) add({ key: 'won', area: 'customers', label: 'Deals won', value: won(inNow), prev: won(inPrev), fmt: 'money', kind: 'measured', href: '/customers', source: 'Pipeline (CRM)',
    def: `Value of pipeline deals marked won in ${per}.` });

  const units = (f: (t: string) => boolean) => r.moves.filter(m => f(m.created_at)).reduce((n, m) => n + Math.max(0, -Number(m.change || 0)), 0);
  add({ key: 'units', area: 'stock', label: 'Units sold', value: units(inNow), prev: units(inPrev), fmt: 'count', kind: 'measured', href: '/inventory?tab=history', source: 'Stock history',
    def: `Units taken out of stock by orders in ${per}. Only products with stock tracking are counted.` });
  add({ key: 'out', area: 'stock', label: 'Out of stock now', value: r.restock.filter(x => x.level === 'out').length, prev: null, fmt: 'count', kind: 'measured', href: '/inventory', source: 'Products and stock', snapshot: true, lowerIsBetter: true,
    def: 'Tracked products (and variants) with nothing left, counted today.' });
  add({ key: 'low', area: 'stock', label: 'Low or running out', value: r.restock.filter(x => x.level === 'low' || x.level === 'soon').length, prev: null, fmt: 'count', kind: 'estimate', href: '/inventory?tab=restock', source: 'Products and stock', snapshot: true, lowerIsBetter: true,
    def: 'At or below the reminder level, or expected to run out within about two weeks at the current selling pace.' });

  const liveIn = (c: any, a: number, b: number) => { const st = new Date(c.starts_at || c.published_at || c.created_at).getTime(); const en = c.ends_at ? new Date(c.ends_at).getTime() : Infinity; return st <= b && en >= a; };
  add({ key: 'camps', area: 'marketing', label: 'Campaigns running', value: r.campaigns.filter(c => c.status !== 'draft' && liveIn(c, F, now)).length, prev: r.campaigns.filter(c => c.status !== 'draft' && liveIn(c, P, F - 1)).length, fmt: 'count', kind: 'measured', href: '/campaigns', source: 'Campaigns',
    def: `Campaigns that were live at any time in ${per}.` });
  add({ key: 'posts', area: 'marketing', label: 'Posts published', value: r.posts.filter(p => inNow(p.published_at)).length, prev: r.posts.filter(p => inPrev(p.published_at)).length, fmt: 'count', kind: 'measured', href: '/publish', source: 'Social posts',
    def: `Posts that went out to a connected account in ${per} (each account counts once).` });
  const campaigns = campaignResults(r.campaigns, same, from, now);
  const tracked = (f: (t: string) => boolean) => same.filter(o => o.status !== 'cancelled' && f(o.created_at) && r.campaigns.some(c => matches(c, o))).reduce((n, o) => n + takings(o), 0);
  add({ key: 'campsales', area: 'marketing', label: 'Sales from campaign links and codes', value: tracked(inNow), prev: tracked(inPrev), fmt: 'money', kind: 'measured', href: '/campaigns', source: 'Orders + Campaigns',
    def: "Money received from orders that came through a campaign's tracked link or used its discount code." });

  const t1 = r.shopNow?.totals, t2 = r.shopBoth?.totals;
  const prevOf = (k: string) => (t1 && t2 ? Math.max(0, (+t2[k] || 0) - (+t1[k] || 0)) : null);
  if (t1) {
    add({ key: 'visits', area: 'online', label: 'Shop link visits', value: +t1.visits || 0, prev: prevOf('visits'), fmt: 'count', kind: 'measured', href: '/shop', source: 'AI shop link',
      def: `Times your shop link was opened in ${per}.` });
    add({ key: 'enq', area: 'online', label: 'Shop enquiries', value: +t1.enquiries || 0, prev: prevOf('enquiries'), fmt: 'count', kind: 'measured', href: '/leads', source: 'AI shop link',
      def: `Questions and quote requests sent from your shop link in ${per}.` });
    const conv = (v: number, o: number, e: number) => (v ? Math.round(((o + e) / v) * 1000) / 10 : null);
    const pv = prevOf('visits');
    add({ key: 'conv', area: 'online', label: 'Shop conversion', value: conv(+t1.visits || 0, +t1.orders || 0, +t1.enquiries || 0), prev: pv ? conv(pv, prevOf('orders') || 0, prevOf('enquiries') || 0) : null, fmt: 'pct', kind: 'measured', href: '/shop', source: 'AI shop link',
      def: 'Visits that led to an order or an enquiry, as a percentage of all visits.' });
  }
  // Only what a website sent in and Nexora recorded (connection tests and Nexora's own updates are left out).
  const WEB_IN = ['order', 'order_update', 'enquiry', 'customer', 'product', 'stock'];
  const web = (f: (t: string) => boolean) => r.webEvents.filter(e => f(e.created_at) && WEB_IN.includes(e.kind) && e.status === 'processed').length;
  const webOrders = (f: (t: string) => boolean) => same.filter(o => channelOf(o) === 'website' && o.status !== 'cancelled' && f(o.created_at)).length;
  if (r.sites.length) {
    add({ key: 'webev', area: 'online', label: 'Website activity', value: web(inNow), prev: web(inPrev), fmt: 'count', kind: 'measured', href: '/website', source: 'Connected websites',
      def: `Enquiries, orders, product and customer updates received from your connected websites in ${per}.` });
    add({ key: 'weborders', area: 'online', label: 'Website orders', value: webOrders(inNow), prev: webOrders(inPrev), fmt: 'count', kind: 'measured', href: '/orders?filter=All', source: 'Orders (website)',
      def: `Orders that came in from a connected website in ${per}.` });
  }

  // Day by day, this period against the one before (same weekday positions).
  const daily = Array.from({ length: range }, (_, i) => {
    const d0 = from.getTime() + i * DAY, p0 = d0 - range * DAY;
    const day = cur.filter(o => { const t = new Date(o.created_at).getTime(); return t >= d0 && t < d0 + DAY; });
    const pday = prev.filter(o => { const t = new Date(o.created_at).getTime(); return t >= p0 && t < p0 + DAY; });
    return { day: iso(new Date(d0)), revenue: sum(day, takings), prev: sum(pday, takings), orders: day.length };
  });
  const channels = (Object.keys(CHANNEL_TEXT) as Channel[]).map(ch => { const l = cur.filter(o => channelOf(o) === ch); return { ch, label: CHANNEL_TEXT[ch], orders: l.length, sales: sum(l, takings) }; }).filter(x => x.orders);

  const ov: Overview = { range, from, to, prevFrom, currency, otherCurrency, kpis, daily, channels, anomalies: [], campaigns, generated: new Date(now), sources: {} };
  ov.anomalies = findAnomalies(ov, r);
  return ov;
}

const matches = (c: any, o: Order & { coupon_code?: string | null }) =>
  (!!c.src && !!o.src && String(o.src).toLowerCase() === String(c.src).toLowerCase()) || (!!c.coupon_code && !!o.coupon_code && String(o.coupon_code).toUpperCase() === String(c.coupon_code).toUpperCase());

/** Campaign → sales. Measured when orders carry the campaign's link or code; otherwise a timing comparison, marked Estimate. */
function campaignResults(list: any[], orders: Order[], from: Date, now: number): CampaignResult[] {
  const F = from.getTime();
  const out: CampaignResult[] = [];
  for (const c of list) {
    if (c.status === 'draft') continue;
    const s = new Date(c.starts_at || c.published_at || c.created_at).getTime();
    const e = Math.min(c.ends_at ? new Date(c.ends_at).getTime() : now, now);
    if (!(s <= now && e >= F)) continue;   // not live during this period
    const window = `${fmtDate(new Date(s))} – ${c.ends_at && new Date(c.ends_at).getTime() <= now ? fmtDate(new Date(c.ends_at)) : 'now'}`;
    const ok = orders.filter(o => o.status !== 'cancelled');
    const hit = ok.filter(o => matches(c, o as any) && new Date(o.created_at).getTime() >= s);
    if (hit.length) {
      out.push({ id: c.id, name: c.name, channel: c.channel, window, orders: hit.length, sales: hit.reduce((n, o) => n + takings(o), 0), kind: 'measured',
        note: `Counted from orders that used ${[c.src && 'its tracked link', c.coupon_code && `code ${c.coupon_code}`].filter(Boolean).join(' or ')}.` });
      continue;
    }
    const len = Math.max(DAY, e - s);
    const during = ok.filter(o => { const t = new Date(o.created_at).getTime(); return t >= s && t <= e; });
    const before = ok.filter(o => { const t = new Date(o.created_at).getTime(); return t >= s - len && t < s; });
    const dv = during.reduce((n, o) => n + takings(o), 0), bv = before.reduce((n, o) => n + takings(o), 0);
    const enough = during.length + before.length >= 4;
    out.push({ id: c.id, name: c.name, channel: c.channel, window, orders: 0, sales: 0, kind: 'estimate', during: dv, before: bv,
      note: enough ? 'No order used its link or code yet. Compared with the same number of days before it started, on timing only, so other things may explain the difference.'
        : 'No order used its link or code yet, and there are too few orders around it to compare. Share its tracked link or code so Nexora can measure it.' });
  }
  return out.sort((a, b) => (b.sales || b.during || 0) - (a.sales || a.during || 0));
}

/** Unusual changes found in the records (measured), each with a next step. */
function findAnomalies(ov: Overview, r: Raw): Anomaly[] {
  const out: Anomaly[] = [];
  const k = (key: string) => ov.kpis.find(x => x.key === key);
  const sym: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };
  const money = (v: number) => `${sym[ov.currency] ?? `${ov.currency} `}${Math.round(v).toLocaleString('en-US')}`;
  const days = ov.daily.map(d => d.revenue), nz = days.filter(v => v > 0).sort((a, b) => a - b);
  const median = nz.length ? nz[Math.floor(nz.length / 2)] : 0;
  if (nz.length >= 4) {
    const peak = ov.daily.reduce((b, d) => (d.revenue > b.revenue ? d : b), ov.daily[0]);
    if (peak.revenue >= median * 3) out.push({ key: 'spike', tone: 'good', title: `Unusually strong day: ${new Date(`${peak.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      detail: `${money(peak.revenue)} received from ${peak.orders} order${peak.orders === 1 ? '' : 's'}, about ${Math.round(peak.revenue / Math.max(1, median))} times a usual selling day (${money(median)}).`,
      action: { label: 'See that day’s orders', href: '/orders?filter=All' }, ask: `My sales on ${peak.day} were ${money(peak.revenue)}, about ${Math.round(peak.revenue / Math.max(1, median))} times a normal day. What could explain it and how do I repeat it?` });
  }
  const s = k('sales');
  if (s && s.value !== null && s.prev && !s.few) {
    const ch = changePct(s.value, s.prev) ?? 0;
    if (ch <= -30) out.push({ key: 'drop', tone: 'bad', title: `Money received is down ${Math.abs(ch)}%`, detail: `${money(s.value)} in the last ${ov.range} days against ${money(s.prev)} in the ${ov.range} days before.`,
      action: { label: 'Plan a campaign', href: '/campaigns' }, ask: `My money received fell ${Math.abs(ch)}% (${money(s.prev)} to ${money(s.value)}) over ${ov.range} days. What are the likely reasons and what should I do this week?` });
    if (ch >= 50) out.push({ key: 'rise', tone: 'good', title: `Money received is up ${ch}%`, detail: `${money(s.value)} in the last ${ov.range} days against ${money(s.prev)} before.`,
      action: { label: 'See best sellers', href: '/inventory' }, ask: `My money received rose ${ch}% over ${ov.range} days. What is driving it and how do I keep it going?` });
  }
  const quiet = (() => { let n = 0; for (let i = ov.daily.length - 1; i >= 0 && ov.daily[i].orders === 0; i--) n++; return n; })();
  const usual = ov.daily.filter(d => d.orders > 0).length / Math.max(1, ov.daily.length);
  if (quiet >= 5 && usual >= 0.3) out.push({ key: 'quiet', tone: 'warn', title: `No orders in the last ${quiet} days`, detail: `You usually get orders on ${Math.round(usual * 100)}% of days in this period.`,
    action: { label: 'Message past customers', href: '/customers' }, ask: `I've had no orders for ${quiet} days but usually sell most days. What should I check and do first?` });
  const u = k('unpaid'), sv = s?.value ?? 0;
  if (u?.value && u.value > Math.max(sv * 0.25, 0) && u.value > 0) out.push({ key: 'unpaid', tone: 'warn', title: `${money(u.value)} is still waiting to be paid`, detail: `That is ${sv ? `${Math.round((u.value / sv) * 100)}% of the money received` : 'more than you have received'} in this period.`,
    action: { label: 'See unpaid orders', href: '/orders?filter=Unpaid' }, ask: `${money(u.value)} of orders are unpaid. How do I follow up politely and get paid faster?` });
  const c = k('cancel'), o = k('orders');
  if (c?.value && o && c.value >= 2 && c.value / Math.max(1, c.value + (o.value || 0)) >= 0.2) out.push({ key: 'cancel', tone: 'bad', title: `${c.value} orders cancelled`, detail: `${Math.round((c.value / (c.value + (o.value || 0))) * 100)}% of orders placed in this period were cancelled.`,
    action: { label: 'See cancelled orders', href: '/orders?filter=Cancelled' }, ask: `${c.value} of my recent orders were cancelled. What usually causes this and how can I reduce it?` });
  const hotOut = r.restock.filter(x => x.level === 'out' && Number(x.sold_30d) > 0);
  if (hotOut.length) out.push({ key: 'stockout', tone: 'bad', title: `${hotOut.length} selling product${hotOut.length === 1 ? ' is' : 's are'} out of stock`, detail: `${hotOut.slice(0, 3).map(x => x.name).join(', ')}${hotOut.length > 3 ? ' and more' : ''} ${hotOut.length === 1 ? 'sold in the last 30 days but has' : 'sold in the last 30 days but have'} none left.`,
    action: { label: 'Restock now', href: '/inventory?tab=restock' }, ask: `These products sell but are out of stock: ${hotOut.map(x => x.name).join(', ')}. How much should I reorder and what should I tell customers meanwhile?` });
  const v = k('visits'), cv = k('conv');
  if (v?.value && v.value >= 20 && cv && (cv.value ?? 0) < 1) out.push({ key: 'conv', tone: 'warn', title: 'Shop visitors are not ordering', detail: `${v.value} visits but under 1% ordered or asked a question.`,
    action: { label: 'Improve the shop', href: '/shop' }, ask: `My shop link had ${v.value} visits but almost no orders or enquiries. What should I change on the shop first?` });
  return out;
}

export const fmtValue = (k: Pick<Kpi, 'fmt' | 'value'>, money: (v: number) => string) =>
  k.value === null ? '—' : k.fmt === 'money' ? money(k.value) : k.fmt === 'pct' ? `${k.value}%` : Math.round(k.value).toLocaleString();

/** A plain summary of the overview, used for the report and for asking Nexora to explain the numbers. */
export function overviewText(ov: Overview, money: (v: number) => string, business = '') {
  const lines = [`${business ? `${business} · ` : ''}Business overview, ${rangeText(ov)} (compared with the ${ov.range} days before).`];
  for (const a of Object.keys(AREA_TEXT) as Area[]) {
    const ks = ov.kpis.filter(k => k.area === a);
    if (!ks.length) continue;
    lines.push(`${AREA_TEXT[a]}: ${ks.map(k => { const ch = changePct(k.value, k.prev); return `${k.label} ${fmtValue(k, money)}${k.snapshot ? ' (today)' : ch === null ? '' : ` (${ch >= 0 ? '+' : ''}${ch}%)`}`; }).join('; ')}.`);
  }
  if (ov.anomalies.length) lines.push(`Unusual: ${ov.anomalies.map(a => a.title).join('; ')}.`);
  for (const c of ov.campaigns) lines.push(c.kind === 'measured' ? `Campaign ${c.name}: ${c.orders} tracked orders, ${money(c.sales)}.` : `Campaign ${c.name}: no tracked orders; ${money(c.during || 0)} during vs ${money(c.before || 0)} before (timing only).`);
  return lines.join('\n');
}

/** The report as CSV rows: each figure with its dates, meaning, source and type. */
export function reportRows(ov: Overview, money: (v: number) => string, business = ''): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    ['Nexora business report', business], ['Period', rangeText(ov)], ['Compared with', `${fmtDate(ov.prevFrom)} – ${fmtDate(new Date(ov.from.getTime() - DAY))}`],
    ['Currency', ov.currency], ['Made on', ov.generated.toLocaleString()], [],
    ['Area', 'Figure', 'This period', 'Period before', 'Change', 'Type', 'What it means', 'Source'],
  ];
  for (const k of ov.kpis) {
    const ch = changePct(k.value, k.prev);
    rows.push([AREA_TEXT[k.area], k.label, fmtValue(k, money), k.snapshot ? 'counted today' : k.prev === null ? '' : fmtValue({ fmt: k.fmt, value: k.prev }, money), ch === null ? '' : `${ch}%`, KIND_TEXT[k.kind], k.def, k.source]);
  }
  if (ov.anomalies.length) { rows.push([], ['Unusual changes (measured)', 'Detail', 'Next step']); for (const a of ov.anomalies) rows.push([a.title, a.detail, a.action.label]); }
  if (ov.campaigns.length) { rows.push([], ['Campaign', 'Dates', 'Tracked orders', 'Money from tracked orders', 'During (timing only)', 'Before (timing only)', 'Type', 'Note']);
    for (const c of ov.campaigns) rows.push([c.name, c.window, c.orders, money(c.sales), c.during === undefined ? '' : money(c.during), c.before === undefined ? '' : money(c.before), KIND_TEXT[c.kind], c.note]); }
  rows.push([], ['Day', 'Money received', 'Orders', 'Same day, period before']);
  for (const d of ov.daily) rows.push([d.day, Math.round(d.revenue), d.orders, Math.round(d.prev)]);
  if (ov.otherCurrency) rows.push([], [`${ov.otherCurrency} order(s) in other currencies are not included in these totals.`]);
  return rows;
}
