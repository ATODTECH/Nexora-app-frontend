import { supabase } from './supabase';

/** A customer or lead as the CRM sees it (crm_contacts). Same as the website's Contact. */
export type Contact = {
  id: string; name: string; channel: string; handle: string; segment: string; location: string | null; total_orders: number | null; total_spent: number | null;
  last_order_at: string | null; tags: string[] | null; last_interaction_at: string | null; created_at: string; phone?: string; email?: string; company?: string; source?: string;
  consent?: Partial<Record<'whatsapp' | 'sms' | 'email' | 'calls' | 'marketing', boolean>> & { updated_at?: string };
  masked?: boolean; orders_n?: number; spent?: number; last_order?: string | null; open_deals?: number; open_value?: number; last_activity?: string | null;
  next_task_date?: string | null; dnc?: boolean; rfm?: string; lead_score?: number;
};
export const LEAD_STAGES = ['Lead', 'Contacted', 'Qualified'];
export const isLead = (c: Contact) => LEAD_STAGES.includes(c.segment);
export const localIsoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export async function loadCrmContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.rpc('crm_contacts');
  if (error) throw new Error("Couldn't load your customers.");
  return (data ?? []) as Contact[];
}

// CRM (capability 2.7): the sales pipeline, smart segments (RFM), re-engagement, duplicates and merging,
// and access to contact details. The database does the sums and the access checks (crm_contacts, crm_timeline,
// crm_reveal, crm_duplicates, crm_merge); these helpers only shape what the screens show.

export const DEAL_STAGES = [
  { key: 'new', label: 'New', prob: 0.1 },
  { key: 'contacted', label: 'Contacted', prob: 0.25 },
  { key: 'quote', label: 'Quote sent', prob: 0.5 },
  { key: 'negotiation', label: 'Negotiating', prob: 0.75 },
  { key: 'won', label: 'Won', prob: 1 },
  { key: 'lost', label: 'Lost', prob: 0 },
] as const;
export type DealStage = (typeof DEAL_STAGES)[number]['key'];
export const stageLabel = (s: string) => DEAL_STAGES.find(x => x.key === s)?.label ?? s;
export const stageProb = (s: string) => DEAL_STAGES.find(x => x.key === s)?.prob ?? 0;
export const OPEN_STAGES: DealStage[] = ['new', 'contacted', 'quote', 'negotiation'];
export const LOST_REASONS = ['Price too high', 'Bought elsewhere', 'No reply', 'Not ready yet', 'Out of stock', 'Other'];

export type Deal = {
  id: string; customer_id: string | null; title: string; value: number; currency: string; stage: DealStage; expected_close: string | null;
  source: string; notes: string; lost_reason: string; created_at: string; updated_at: string; closed_at: string | null;
};
export type DealForm = { id?: string; customer_id: string | null; title: string; value: string; currency: string; stage: DealStage; expected_close: string; notes: string; source: string };

/** RFM groups: who buys often, recently and for how much. Worked out by the database (crm_contacts). */
export const RFM = [
  { key: 'Champion', label: 'Champions', blurb: 'Buy often and bought recently. Reward them and ask for referrals.', tone: ['#E6F4ED', '#1E9E6D'] },
  { key: 'Loyal', label: 'Loyal', blurb: 'Regular buyers. Offer early access or a bundle.', tone: ['#E6F4ED', '#1E9E6D'] },
  { key: 'New customer', label: 'New customers', blurb: 'First order recently. Thank them and suggest a second item.', tone: ['#EEF4FC', '#1E56A0'] },
  { key: 'Promising', label: 'Promising', blurb: 'Bought within your normal cycle. Keep them warm.', tone: ['#EEF4FC', '#1E56A0'] },
  { key: 'At risk', label: 'At risk', blurb: 'Used to buy, now quiet. Re-engage before they go.', tone: ['#FDF3E1', '#B7791F'] },
  { key: 'Lapsed', label: 'Lapsed', blurb: "Haven't bought in a long time. Win them back with a reason to return.", tone: ['#FDECEC', '#C53030'] },
  { key: 'No orders yet', label: 'No orders yet', blurb: 'Customers with no recorded purchase. Make a first offer.', tone: ['#F2F4F7', '#5C6B7A'] },
  { key: 'Lead', label: 'Leads', blurb: 'Interested, not bought yet. Follow up.', tone: ['#F2F4F7', '#5C6B7A'] },
] as const;
export const rfmTone = (k?: string): readonly [string, string] => RFM.find(r => r.key === k)?.tone ?? ['#F2F4F7', '#5C6B7A'];
export const scoreLabel = (n?: number) => (n == null ? '' : n >= 60 ? 'Hot' : n >= 30 ? 'Warm' : 'Cold');
export const scoreTone = (n?: number): [string, string] => ((n ?? 0) >= 60 ? ['#FDECEC', '#C53030'] : (n ?? 0) >= 30 ? ['#FDF3E1', '#B7791F'] : ['#F2F4F7', '#5C6B7A']);

export const CONSENT_KEYS = [
  { key: 'whatsapp', label: 'WhatsApp messages' },
  { key: 'sms', label: 'Text messages (SMS)' },
  { key: 'email', label: 'Emails' },
  { key: 'calls', label: 'Phone calls' },
  { key: 'marketing', label: 'Offers and promotions' },
] as const;
/** Marketing is allowed unless the person said no (or asked not to be called again). */
export const canMarket = (c: Contact) => !c.dnc && c.consent?.marketing !== false;

// ---- Deals ----
export async function loadDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('crm_deals').select('*').order('updated_at', { ascending: false }).limit(1000);
  if (error) throw new Error(/relation|does not exist/i.test(error.message) ? 'The sales pipeline needs the latest database update.' : "Couldn't load your sales pipeline.");
  return (data ?? []).map(d => ({ ...d, value: Number(d.value) || 0 })) as Deal[];
}
export function checkDeal(f: DealForm) {
  if (!f.title.trim()) return 'Give the opportunity a name, e.g. "20 headphones for her office".';
  if (f.value && !(Number(f.value.replace(/,/g, '')) >= 0)) return 'Enter the value as a number.';
  return '';
}
export async function saveDeal(userId: string, f: DealForm) {
  const row = {
    customer_id: f.customer_id, title: f.title.trim().slice(0, 200), value: Number(f.value.replace(/,/g, '')) || 0, currency: f.currency.trim().toUpperCase().slice(0, 3),
    stage: f.stage, expected_close: f.expected_close || null, notes: f.notes.trim().slice(0, 2000), source: f.source.trim().slice(0, 80),
  };
  const { error } = f.id ? await supabase.from('crm_deals').update(row).eq('id', f.id) : await supabase.from('crm_deals').insert({ user_id: userId, ...row });
  if (error) throw new Error(/row-level|permission/i.test(error.message) ? "Your role can't change the sales pipeline." : "Couldn't save the opportunity.");
}
export async function moveDeal(id: string, stage: DealStage, lostReason = '') {
  const { error } = await supabase.from('crm_deals').update({ stage, ...(stage === 'lost' ? { lost_reason: lostReason } : {}) }).eq('id', id);
  if (error) throw new Error(/row-level|permission/i.test(error.message) ? "Your role can't change the sales pipeline." : "Couldn't move the opportunity.");
}
export async function deleteDeal(id: string) {
  const { error } = await supabase.from('crm_deals').delete().eq('id', id);
  if (error) throw new Error("Couldn't delete the opportunity.");
}

// ---- Contact details, duplicates, merge ----
export async function revealContact(id: string): Promise<{ phone: string; email: string; handle: string; address: string; birthday: string | null }> {
  const { data, error } = await supabase.rpc('crm_reveal', { p_customer: id });
  if (error) throw new Error(error.message.includes('role') ? error.message : "Couldn't show the contact details.");
  return data;
}
export type Duplicate = { a_id: string; a_name: string; b_id: string; b_name: string; reason: string };
export async function loadDuplicates(): Promise<Duplicate[]> {
  const { data } = await supabase.rpc('crm_duplicates');
  return (data ?? []) as Duplicate[];
}
export async function mergeContacts(keep: string, drop: string) {
  const { error } = await supabase.rpc('crm_merge', { p_keep: keep, p_drop: drop });
  if (error) throw new Error(/role|Choose/.test(error.message) ? error.message : "Couldn't merge them.");
}

// ---- Saved segments ----
export type SegmentRules = { rfm?: string[]; tags?: string[]; channels?: string[]; minSpent?: number; minOrders?: number; quietDays?: number; marketingOnly?: boolean; kind?: 'customers' | 'leads' | 'all' };
export type Segment = { id: string; name: string; rules: SegmentRules };
export async function loadSegments(): Promise<Segment[]> {
  const { data } = await supabase.from('crm_segments').select('id,name,rules').order('created_at');
  return (data ?? []) as Segment[];
}
export async function saveSegment(userId: string, name: string, rules: SegmentRules) {
  const { error } = await supabase.from('crm_segments').insert({ user_id: userId, name: name.trim().slice(0, 80), rules });
  if (error) throw new Error("Couldn't save the segment.");
}
export async function deleteSegment(id: string) {
  const { error } = await supabase.from('crm_segments').delete().eq('id', id);
  if (error) throw new Error("Couldn't delete the segment.");
}
const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
export function inSegment(c: Contact, r: SegmentRules, isLead: (c: Contact) => boolean) {
  if (r.kind === 'customers' && isLead(c)) return false;
  if (r.kind === 'leads' && !isLead(c)) return false;
  if (r.rfm?.length && !r.rfm.includes(c.rfm || '')) return false;
  if (r.tags?.length && !r.tags.some(t => (c.tags ?? []).includes(t))) return false;
  if (r.channels?.length && !r.channels.includes(c.channel)) return false;
  if (r.minSpent && Number(c.spent ?? c.total_spent ?? 0) < r.minSpent) return false;
  if (r.minOrders && Number(c.orders_n ?? c.total_orders ?? 0) < r.minOrders) return false;
  if (r.quietDays && daysSince(c.last_activity || c.last_interaction_at || c.created_at) < r.quietDays) return false;
  if (r.marketingOnly && !canMarket(c)) return false;
  return true;
}
export const describeRules = (r: SegmentRules) => [
  r.kind && r.kind !== 'all' ? (r.kind === 'leads' ? 'Leads' : 'Customers') : '',
  r.rfm?.length ? r.rfm.join(' or ') : '', r.tags?.length ? `tagged ${r.tags.join(' or ')}` : '', r.channels?.length ? `on ${r.channels.join(' or ')}` : '',
  r.minSpent ? `spent ${r.minSpent}+` : '', r.minOrders ? `${r.minOrders}+ orders` : '', r.quietDays ? `quiet ${r.quietDays}+ days` : '', r.marketingOnly ? 'agreed to offers' : '',
].filter(Boolean).join(' · ') || 'Everyone';

// ---- Settings ----
export type CrmSettings = { auto_link: boolean; auto_create: boolean; lapsed_days: number; repeat_tag: string };
export const CRM_DEFAULTS: CrmSettings = { auto_link: true, auto_create: true, lapsed_days: 90, repeat_tag: 'Repeat customer' };
export async function loadCrmSettings(): Promise<CrmSettings> {
  const { data } = await supabase.from('crm_settings').select('settings').maybeSingle();
  const s = (data?.settings ?? {}) as Record<string, string>;
  return { auto_link: s.auto_link !== 'false', auto_create: s.auto_create !== 'false', lapsed_days: Number(s.lapsed_days) || 90, repeat_tag: s.repeat_tag || CRM_DEFAULTS.repeat_tag };
}
export async function saveCrmSettings(userId: string, s: CrmSettings) {
  // Stored as text so the database can read each value the same way.
  const settings = { auto_link: String(s.auto_link), auto_create: String(s.auto_create), lapsed_days: String(Math.min(730, Math.max(14, Math.round(s.lapsed_days)))), repeat_tag: s.repeat_tag.trim().slice(0, 40) || CRM_DEFAULTS.repeat_tag };
  const { error } = await supabase.from('crm_settings').upsert({ user_id: userId, settings, updated_at: new Date().toISOString() });
  if (error) throw new Error("Couldn't save the CRM settings.");
}

// ---- Tasks linked to a person ----
export type ContactTask = { id: string; title: string; event_date: string; start_time: string; status: string; event_type: string };
export async function loadTasksFor(customerId: string): Promise<ContactTask[]> {
  const { data } = await supabase.from('schedule_events').select('id,title,event_date,start_time,status,event_type').eq('customer_id', customerId).order('event_date').limit(50);
  return (data ?? []) as ContactTask[];
}
/** One follow-up task per person (on the Tasks and schedule screen), linked to their record. */
export async function addTasks(userId: string, people: Pick<Contact, 'id' | 'name'>[], date: string, title: (name: string) => string, time = '10:00 AM', notes = '') {
  if (!people.length) return 0;
  const rows = people.map(p => ({ user_id: userId, customer_id: p.id, title: title(p.name).slice(0, 200), with_whom: p.name, event_date: date, start_time: time, end_time: '', notes, event_type: 'follow_up', status: 'scheduled', created_by: 'owner' }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('schedule_events').insert(rows.slice(i, i + 200));
    if (error) throw new Error("Couldn't create the follow-up tasks.");
  }
  return rows.length;
}

// ---- Export (shared as text on the phone) ----
export function contactsCsv(list: Contact[]) {
  const head = ['Name', 'Type', 'Stage', 'Group', 'Lead score', 'Phone', 'Email', 'Channel', 'Company', 'Orders', 'Spent', 'Last order', 'Tags', 'Agreed to offers'];
  const esc = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = list.map(c => [c.name, isLead(c) ? 'Lead' : 'Customer', c.segment, c.rfm ?? '', c.lead_score ?? '', c.phone ?? '', c.email ?? '', c.channel, c.company ?? '',
    c.orders_n ?? c.total_orders ?? 0, c.spent ?? c.total_spent ?? 0, (c.last_order || c.last_order_at || '').slice(0, 10), (c.tags ?? []).join('; '), c.consent?.marketing === false ? 'No' : 'Yes']);
  return [head, ...rows].map(r => r.map(esc).join(',')).join('\n');
}
export const fmtMoney = (n: number, currency = '') => {
  const s = n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sym = ({ NGN: '₦', USD: '$', GBP: '£', EUR: '€', KES: 'KSh ', GHS: 'GH₵', ZAR: 'R' } as Record<string, string>)[currency.toUpperCase()] ?? (currency ? `${currency} ` : '');
  return `${sym}${s}`;
};
