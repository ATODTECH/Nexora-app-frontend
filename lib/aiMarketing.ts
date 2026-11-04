import { callNexora as callFn } from './autopilot';
import { supabase } from './supabase';

// AI Marketing and Campaign Management (blueprint 2.5). The engine is the nexora-campaigns function; campaigns are the same
// rows as the Campaigns screen (tracked link, discount code, dates), now with a goal, audience, budget, an AI plan and
// touches (one per channel and date, each with its own tracked link). The website has the same rules in src/lib/aiMarketing.ts.

export type Kind = 'promotion' | 'launch' | 'referral' | 'reengage' | 'retention' | 'awareness' | 'event' | 'clearance';
export const KINDS: { k: Kind; label: string; hint: string }[] = [
  { k: 'promotion', label: 'Promotion', hint: 'Sell more of a product with an offer' },
  { k: 'launch', label: 'New product', hint: 'Announce something new' },
  { k: 'clearance', label: 'Clear stock', hint: 'Move slow or old stock' },
  { k: 'reengage', label: 'Win back', hint: 'Customers who stopped buying' },
  { k: 'retention', label: 'Loyalty', hint: 'Thank and keep regular customers' },
  { k: 'referral', label: 'Refer a friend', hint: 'Customers bring customers' },
  { k: 'event', label: 'Season or event', hint: 'Holidays, back to school, sales days' },
  { k: 'awareness', label: 'Get known', hint: 'Reach new people' },
];
export const CHANNELS: { k: string; label: string; social?: boolean; message?: boolean }[] = [
  { k: 'whatsapp', label: 'WhatsApp', message: true }, { k: 'instagram', label: 'Instagram', social: true }, { k: 'facebook', label: 'Facebook', social: true },
  { k: 'tiktok', label: 'TikTok', social: true }, { k: 'email', label: 'Email', message: true }, { k: 'sms', label: 'SMS', message: true },
  { k: 'x', label: 'X', social: true }, { k: 'linkedin', label: 'LinkedIn', social: true }, { k: 'website', label: 'Website' }, { k: 'flyer', label: 'Flyer / in store' },
];
export const channelLabel = (k: string) => CHANNELS.find(c => c.k === k)?.label ?? k;

export type Brief = { kind: Kind; goal: string; products: string[]; channels: string[]; audience: string; start: string; end: string; budget: string; offer: 'auto' | 'none' | 'percent' | 'amount' | 'free_delivery' | 'bundle'; offer_value: string; notes: string };
export type Step = { day: number; channel: string; title: string; copy_a: string; copy_b: string; cta: string; image?: string | null };
export type Research = { country: string; dates: { date: string; name: string; kind: 'holiday' | 'shopping'; days: number }[]; trends: { term: string; traffic: string; url: string; relevant: boolean }[];
  news: { title: string; url: string; source: string; date: string }[]; competitors: string[]; sources: { title: string; url: string }[]; at: string };
export type BestTime = { enough: boolean; events: number; day: string; hour: number; label: string; rows: string[]; cols: string[]; grid: number[][] };
export type Plan = {
  ideas: { name: string; angle: string; why: string }[]; name: string; summary: string; offer: { type: 'percent' | 'amount' | 'none'; value: number | null; code: string; min_order: number | null; text: string };
  cta: string; audience: string; audience_note: string; steps: Step[]; ai: boolean; tips: string[]; note?: string; research?: Research; best_time?: BestTime;
};
export type Audience = { key: string; label: string; count: number };
export type Context = { business: { name: string; currency: string; shop: boolean; websites: string[] }; products: { id: string; name: string; price: string; stock: string; image: string | null }[]; best_sellers: { name: string; qty: number }[]; audiences: { total: number; opted_out: number; list: Audience[] }; links: { shop: string; website: string } };
export type Touch = { id: string; campaign_id: string; channel: string; title: string; body: string; variant: string; cta: string; src: string; scheduled_at: string | null; audience: { key?: string }; status: 'planned' | 'scheduled' | 'sent' | 'shared' | 'done' | 'skipped'; sent_count: number; image: string | null; social_post_id: string | null; history: { at: string; text: string }[] };
export type Campaign = { id: string; name: string; kind: Kind; goal: string; status: 'draft' | 'scheduled' | 'active' | 'ended'; src: string; coupon_code: string | null; discount_type: string | null; discount_value: number | null; starts_at: string | null; ends_at: string | null; budget: number | null; cta: string; audience: { key?: string }; plan: { summary?: string; ideas?: Plan['ideas']; tips?: string[]; offer_text?: string; ai?: boolean; audience_note?: string; best_time?: string;
    online?: { dates?: { date: string; name: string }[]; trends?: string[]; competitors?: string[]; sources?: { title: string; url: string }[] } }; created_at: string };
export type ChannelResult = { channel: string; src: string; visits: number; enquiries: number; chats: number; orders: number; sales: number; sent: number; engagement: number };
export type Result = { id: string; name: string; kind: Kind; status: string; totals: { visits: number; enquiries: number; chats: number; orders: number; paid_orders: number; sales: number; sent: number; engagement: number; coupon_uses: number; conversion: number | null; cost_per_order: number | null; return_on_spend: number | null }; channels: ChannelResult[]; daily: { day: string; visits: number; orders: number }[]; touches: number; touches_done: number };
export type Advice = { title: string; evidence: string; action: string; confidence: 'strong' | 'early'; href?: string };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const emptyBrief = (kind: Kind = 'promotion'): Brief => ({ kind, goal: '', products: [], channels: ['whatsapp', 'instagram', 'facebook'], audience: kind === 'reengage' ? 'inactive' : 'all', start: iso(new Date()), end: iso(new Date(Date.now() + 13 * 86400000)), budget: '', offer: 'auto', offer_value: '', notes: '' });
const briefBody = (b: Brief) => ({ ...b, budget: Number(b.budget) || null, offer_value: Number(b.offer_value) || null, tz: -new Date().getTimezoneOffset() });

export const loadResearch = (products: string[] = [], deep = false) => callFn<{ research: Research; best_time: BestTime }>('nexora-campaigns', { action: 'research', products, deep, tz: -new Date().getTimezoneOffset() }, deep ? 60000 : 30000);
export const loadContext = () => callFn<Context>('nexora-campaigns', { action: 'context' }, 45000);
export const generatePlan = (b: Brief) => callFn<{ plan: Plan }>('nexora-campaigns', { action: 'generate', brief: briefBody(b) }, 120000).then(r => r.plan);
export const createCampaign = (plan: Plan, b: Brief, launch: boolean) => callFn<{ campaign: Campaign }>('nexora-campaigns', { action: 'create', plan, brief: briefBody(b), launch }, 45000).then(r => r.campaign);
export const loadResults = (campaignId?: string) => callFn<{ campaigns: Result[]; currency: string }>('nexora-campaigns', { action: 'results', campaign_id: campaignId }, 60000);
export const loadAdvice = () => callFn<{ items: Advice[]; campaigns: number; tracked_visits: number }>('nexora-campaigns', { action: 'recommend' }, 60000);
export const sendTouch = (touchId: string) => callFn<{ sent?: number; message: string; recipients?: { id: string; name: string; phone: string; text: string; link: string }[] }>('nexora-campaigns', { action: 'send', touch_id: touchId }, 90000);
export const touchToSocial = (touchId: string) => callFn<{ message: string; post_id: string }>('nexora-campaigns', { action: 'to_social', touch_id: touchId }, 45000);
export const touchLink = (src: string) => callFn<{ link: string }>('nexora-campaigns', { action: 'link', src }).then(r => r.link);
export const setOptOut = (customerId: string, out: boolean) => callFn('nexora-campaigns', { action: 'opt_out', customer_id: customerId, out });

export async function loadCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from('campaigns').select('id,name,kind,goal,status,src,coupon_code,discount_type,discount_value,starts_at,ends_at,budget,cta,audience,plan,created_at').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Campaign[];
}
export async function loadTouches(campaignId?: string): Promise<Touch[]> {
  let q = supabase.from('campaign_touches').select('*').order('scheduled_at').limit(1000);
  if (campaignId) q = q.eq('campaign_id', campaignId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Touch[]).map(t => ({ ...t, history: Array.isArray(t.history) ? t.history : [] }));
}
export async function updateTouch(t: Touch, patch: Partial<Pick<Touch, 'title' | 'body' | 'cta' | 'scheduled_at' | 'status' | 'variant'>>, note?: string) {
  const { error } = await supabase.from('campaign_touches').update({ ...patch, ...(note ? { history: [...t.history, { at: new Date().toISOString(), text: note }].slice(-30) } : {}) }).eq('id', t.id);
  if (error) throw new Error(error.message);
}
export async function addTouch(c: Campaign, channel: string, at: string, body: string) {
  const { error } = await supabase.from('campaign_touches').insert({ campaign_id: c.id, user_id: (await supabase.auth.getUser()).data.user?.id, channel, title: `${channelLabel(channel)} post`, body, cta: c.cta, src: `${c.src}-${channel.slice(0, 4)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 40), scheduled_at: at, audience: c.audience ?? {}, history: [{ at: new Date().toISOString(), text: 'Added by you' }] });
  if (error) throw new Error(error.message);
}
export async function deleteTouch(id: string) { const { error } = await supabase.from('campaign_touches').delete().eq('id', id); if (error) throw new Error(error.message); }
export async function setCampaignStatus(id: string, status: Campaign['status']) {
  const { error } = await supabase.from('campaigns').update({ status, updated_at: new Date().toISOString(), ...(status === 'active' ? { published_at: new Date().toISOString() } : {}) }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function deleteCampaign(id: string) { const { error } = await supabase.from('campaigns').delete().eq('id', id); if (error) throw new Error(error.message); }
/** The touch's copy B (kept in its history when planned). */
export const copyB = (t: Touch) => t.history.find(h => h.text.startsWith('Copy B: '))?.text.slice(8) ?? '';
export const fillCopy = (text: string, link: string) => text.replace(/\{link\}/g, link || '[your link]').replace(/\{name\}|\{first_name\}/g, 'there');
