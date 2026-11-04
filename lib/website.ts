import { callNexora as callFn } from './autopilot';
import { supabase } from './supabase';

// Website and Digital Channel Integration (blueprint 2.4). The engine is the nexora-website function: a one-line script
// (visits, sources, enquiry forms), signed webhooks (WooCommerce, Shopify, any platform) and a secret-key API bring
// enquiries, orders, order updates, products (with stock) and customers into Customers, Orders, Products and Insights.
// Every delivery is logged (sync history) and can be retried; Nexora sends order changes back to the site when asked.

export type Platform = 'custom' | 'wordpress' | 'woocommerce' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'other';
export type Method = 'script' | 'webhook' | 'api';
export type SiteSettings = {
  enquiries: boolean; orders: boolean; products: boolean; product_mode: 'review' | 'auto'; customers: boolean; page_views: boolean;
  stock_from_orders: boolean; auto_forms: boolean; alert_enquiries: boolean; thank_you: string; callback_url: string;
};
export type Site = {
  id: string; name: string; url: string; platform: Platform; method: Method; public_key: string; status: 'active' | 'paused'; settings: Partial<SiteSettings>;
  last_event_at: string | null; last_ok_at: string | null; last_error: string; last_error_at: string | null; events_total: number; verified_at: string | null; script_seen_at: string | null; created_at: string;
};
export type SiteEvent = {
  id: string; connection_id: string; kind: string; status: 'processed' | 'skipped' | 'failed' | 'duplicate'; via: 'script' | 'webhook' | 'api' | 'nexora';
  title: string; detail: string; error: string; payload: unknown; ref_table: string | null; ref_id: string | null; attempts: number; created_at: string;
};
export type SiteStat = { connection_id: string; day: string; views: number; enquiries: number; orders: number; revenue: number; products: number; sources: Record<string, number> };
export type Links = { script: string; script_url: string; webhook_url: string; api_url: string };

export const DEFAULT_SETTINGS: SiteSettings = {
  enquiries: true, orders: true, products: true, product_mode: 'review', customers: true, page_views: true, stock_from_orders: true, auto_forms: true,
  alert_enquiries: true, thank_you: 'Thanks! We got your message and will reply soon.', callback_url: '',
};
export const settingsOf = (s: Site): SiteSettings => ({ ...DEFAULT_SETTINGS, ...(s.settings ?? {}) });

export const PLATFORMS: { k: Platform; name: string; method: Method; also?: Method; note: string }[] = [
  { k: 'woocommerce', name: 'WooCommerce', method: 'webhook', also: 'script', note: 'Orders, products and customers by webhooks; enquiry forms with the code' },
  { k: 'shopify', name: 'Shopify', method: 'webhook', also: 'script', note: 'Orders, products and customers by webhooks; visits with the code' },
  { k: 'wordpress', name: 'WordPress', method: 'script', note: 'Visits and contact forms with one line of code' },
  { k: 'wix', name: 'Wix', method: 'script', note: 'Visits and forms (needs a Wix plan with a connected domain)' },
  { k: 'squarespace', name: 'Squarespace', method: 'script', note: 'Visits and forms (Business plan or higher)' },
  { k: 'webflow', name: 'Webflow', method: 'script', note: 'Visits and forms (paid site plan)' },
  { k: 'custom', name: 'My own website', method: 'script', note: 'Any website where you can add code' },
  { k: 'other', name: 'Developer / other', method: 'api', note: 'Send anything with the Nexora API or signed webhooks' },
];
export const platformInfo = (k: string) => PLATFORMS.find(p => p.k === k) ?? PLATFORMS[6];
export const KIND_LABEL: Record<string, string> = { page_view: 'Visit', enquiry: 'Enquiry', order: 'Order', order_update: 'Order update', product: 'Product', customer: 'Customer', test: 'Test', order_sent: 'Sent to website', check: 'Check', delivery: 'Delivery' };
export const VIA_LABEL: Record<string, string> = { script: 'Website code', webhook: 'Webhook', api: 'API', nexora: 'Nexora' };

// ---------- Reading ----------
export async function loadSites(): Promise<Site[]> {
  const { data, error } = await supabase.from('website_connections').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Site[];
}
export async function loadEvents(limit = 300): Promise<SiteEvent[]> {
  const { data, error } = await supabase.from('website_events').select('id,connection_id,kind,status,via,title,detail,error,payload,ref_table,ref_id,attempts,created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SiteEvent[];
}
export async function loadStats(days = 30): Promise<SiteStat[]> {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('website_stats').select('connection_id,day,views,enquiries,orders,revenue,products,sources').gte('day', from).order('day');
  if (error) throw new Error(error.message);
  return (data ?? []) as SiteStat[];
}

// ---------- Changing ----------
export const createSite = (f: { name: string; url: string; platform: Platform; method: Method }) =>
  callFn<{ connection: Site; links: Links; api_key: string; signing_secret: string }>('nexora-website', { action: 'create', ...f });
export const siteSecrets = (id: string) => callFn<{ links: Links; signing_secret: string; api_key_hint: string }>('nexora-website', { action: 'secrets', id });
export const rotate = (id: string, which: 'signing' | 'api') => callFn<{ signing_secret?: string; api_key?: string; api_key_hint?: string }>('nexora-website', { action: 'rotate', id, which });
export const setSigning = (id: string, secret: string) => callFn('nexora-website', { action: 'set_signing', id, secret });
export const checkSite = (id: string) => callFn<{ ok: boolean; found: boolean; built: string; title: string; message: string }>('nexora-website', { action: 'check', id }, 45000);
export const testSite = (id: string) => callFn<{ ok: boolean; results: { type: string; status: string; title: string; message: string }[] }>('nexora-website', { action: 'test', id }, 45000);
export const retryEvent = (eventId: string) => callFn<{ status: string; message: string }>('nexora-website', { action: 'retry', event_id: eventId }, 45000);
export async function updateSite(id: string, patch: Partial<Pick<Site, 'name' | 'url' | 'platform' | 'method' | 'status'>> & { settings?: Partial<SiteSettings> }) {
  if (patch.url !== undefined && patch.url && !/^https?:\/\//.test(patch.url)) patch.url = `https://${patch.url.trim()}`;
  const { error } = await supabase.from('website_connections').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteSite(id: string) {
  const { error } = await supabase.from('website_connections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Health ----------
/** 0–100 with the reasons, the same rules as Website watch: quiet sites, failed deliveries, code not seen, paused. */
export function health(s: Site, events: SiteEvent[]): { score: number; label: 'Healthy' | 'Check' | 'Needs attention' | 'Waiting'; why: string[] } {
  const week = events.filter(e => e.connection_id === s.id && Date.now() - new Date(e.created_at).getTime() < 7 * 86400000 && (e.status === 'processed' || e.status === 'failed') && e.via !== 'nexora');
  if (!s.last_event_at && !week.length) return { score: 0, label: 'Waiting', why: ['Nothing received yet: finish the setup, then press “Send a test”.'] };
  let score = 100; const why: string[] = [];
  const age = s.last_event_at ? (Date.now() - new Date(s.last_event_at).getTime()) / 86400000 : 99;
  if (s.status === 'paused') { score -= 40; why.push('Paused: nothing is being saved.'); }
  if (age > 7) { score -= 35; why.push(`Nothing received for ${Math.floor(age)} days.`); } else if (age > 2) { score -= 15; why.push(`Quiet for ${Math.floor(age)} days.`); }
  const failed = week.filter(e => e.status === 'failed').length;
  const ok = week.length ? Math.round(((week.length - failed) / week.length) * 100) : 100;
  if (ok < 90) { score -= Math.round((90 - ok) / 2); why.push(`${failed} of ${week.length} deliveries failed this week.`); }
  if (s.method === 'script' && !s.script_seen_at) { score -= 15; why.push('The website code hasn’t been seen on the site yet.'); }
  score = Math.max(0, Math.min(100, score));
  return { score, label: score >= 85 ? 'Healthy' : score >= 60 ? 'Check' : 'Needs attention', why };
}
export const successRate = (events: SiteEvent[], siteId?: string) => {
  const l = events.filter(e => (!siteId || e.connection_id === siteId) && Date.now() - new Date(e.created_at).getTime() < 7 * 86400000 && (e.status === 'processed' || e.status === 'failed') && e.via !== 'nexora');
  return l.length ? Math.round((l.filter(e => e.status === 'processed').length / l.length) * 100) : null;
};
/** Where a delivery landed in Nexora. */
export const recordLink = (e: SiteEvent) => e.ref_table === 'orders' ? '/orders' : e.ref_table === 'customers' ? '/customers' : e.ref_table === 'knowledge_items' ? '/train?cat=products' : null;
