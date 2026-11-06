import { callNexora as callFn } from './autopilot';
import { supabase } from './supabase';

// AI Customer Communication, Chat and Phone Reception (blueprint 2.6). The engine is the nexora-reception function:
// it answers phone calls (Africa's Talking or Twilio), transfers to the team, takes messages, and after each call
// writes a summary, saves the caller, creates a follow-up task and flags what needs a person. The same rules
// (opening hours, handover keywords, VIP customers, templates) decide who answers WhatsApp, Instagram and Messenger chats.

export type Day = { open: boolean; from: string; to: string };
export type TeamMember = { name: string; phone: string; role?: string };
export type Template = { id: string; name: string; kind: 'after_hours' | 'handover' | 'missed_call' | 'follow_up' | 'general'; body: string };
export type ReceptionSettings = {
  phone_on: boolean; provider: '' | 'africastalking' | 'twilio'; business_number: string; greeting: string; voice: 'woman' | 'man'; language: string; max_call_minutes: number;
  hours: { tz_offset_min: number; days: Day[]; closed_dates: string[] };
  routing: { mode: 'ai_first' | 'team_first' | 'after_hours_only'; team: TeamMember[]; transfer_when: 'asked' | 'asked_or_urgent'; transfer_outside_hours: boolean };
  consent: { ai_disclosure: boolean; record: boolean; announcement: string; allow_opt_out: boolean };
  escalation: { keywords: string[]; negative_sentiment: boolean; complaints: boolean; vip_segments: string[] };
  chat: { mode: 'away' | 'outside_hours' | 'always'; handover_pause_ai: boolean; after_hours_message: boolean };
  follow_up: { create_task: boolean; draft_message: boolean; task_time: string };
  privacy: { keep_days: number; store_transcripts: boolean };
  templates: Template[];
};
export type Webhooks = { africastalking: string; twilio: string; twilio_status: string };
export type ReceptionInfo = {
  settings: ReceptionSettings; business: string; open_now: boolean; next_open: string; hours_text: string; can_edit: boolean;
  webhooks: Webhooks | null; greeting_preview: string;
};
export type Line = { who: 'caller' | 'ai' | 'system'; text: string; at: string };
export type Call = {
  id: string; provider: 'test' | 'twilio' | 'africastalking'; from_number: string; to_number: string; caller_name: string; status: 'live' | 'ended';
  outcome: '' | 'answered' | 'transferred' | 'message' | 'spam' | 'missed' | 'abandoned'; started_at: string; ended_at: string | null; duration_s: number;
  record_consent: boolean; transcript: Line[]; summary: string; category: string; sentiment: string; urgency: string; wants_human: boolean;
  follow_up_needed: boolean; follow_up_draft: string; task_id: string | null; escalation_id: string | null; customer_id: string | null; handled: boolean;
  is_test: boolean; meta: { [k: string]: unknown; dnc?: boolean; transcript_removed?: boolean; open_at_start?: boolean };
};
export type Dnc = { id: string; phone: string; reason: string; created_at: string };
export type ChatTest = { decision: { ai: boolean; draftOnly: boolean; reason: string; handover?: string; autoMessage?: string }; reply: string; open_now: boolean };

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const OUTCOME: Record<string, { label: string; cls: string }> = {
  answered: { label: 'Answered by Nexora', cls: 'bg-success-soft text-success' },
  transferred: { label: 'Passed to the team', cls: 'bg-brand-soft text-brand' },
  message: { label: 'Message taken', cls: 'bg-warning-soft text-warning-mid' },
  spam: { label: 'Spam', cls: 'bg-canvas text-muted' },
  missed: { label: 'Hung up', cls: 'bg-canvas text-muted' },
  abandoned: { label: 'Hung up', cls: 'bg-canvas text-muted' },
  '': { label: 'In progress', cls: 'bg-sky/20 text-brand' },
};
export const CATEGORY: Record<string, string> = {
  sales: 'Buying / prices', order: 'Orders & delivery', booking: 'Bookings', support: 'Help with a product', complaint: 'Complaint',
  billing: 'Payments', general: 'General question', spam: 'Spam',
};
export const PROVIDERS = {
  africastalking: { name: "Africa's Talking", note: 'Nigerian phone numbers (+234). Best for businesses in Nigeria and Kenya.', console: 'https://account.africastalking.com' },
  twilio: { name: 'Twilio', note: 'Numbers in 100+ countries. Nigerian numbers need a registered business.', console: 'https://console.twilio.com' },
} as const;
export const PLACEHOLDERS = ['{customer}', '{business}', '{owner}', '{next_open}', '{hours}'];

export const getReception = () => callFn<ReceptionInfo & { success: true }>('nexora-reception', { action: 'get' });
export const saveReception = (settings: ReceptionSettings) => callFn<Omit<ReceptionInfo, 'business' | 'can_edit' | 'webhooks'> & { success: true }>('nexora-reception', { action: 'save', settings });
export const newToken = () => callFn<{ webhooks: Webhooks }>('nexora-reception', { action: 'new_token' });
export const testStart = (p: { open?: boolean; name?: string; from?: string }) => callFn<{ call_id: string; say: string }>('nexora-reception', { action: 'test_start', ...p });
export const testTurn = (call_id: string, said: string) => callFn<{ say: string; next: 'listen' | 'transfer' | 'hangup'; to: string[]; call: Call | null }>('nexora-reception', { action: 'test_turn', call_id, said }, 45000);
export const testEnd = (call_id: string) => callFn<{ call: Call }>('nexora-reception', { action: 'test_end', call_id }, 45000);
export const testChat = (p: { text: string; customer?: string; segments?: string[]; away?: boolean; hour?: number; status?: string }) =>
  callFn<ChatTest>('nexora-reception', { action: 'test_chat', ...p }, 45000);

export async function loadCalls(days = 90): Promise<Call[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.from('reception_calls').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(1000);
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Phone reception needs its database update. Please run the latest migration.' : "Couldn't load calls.");
  return (data ?? []) as Call[];
}
export async function updateCall(id: string, patch: Partial<Pick<Call, 'handled' | 'follow_up_draft' | 'transcript'>>) {
  const { error } = await supabase.from('reception_calls').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error("Couldn't update the call.");
}
export async function deleteCall(id: string) {
  const { error } = await supabase.from('reception_calls').delete().eq('id', id);
  if (error) throw new Error("Couldn't delete the call.");
}
export async function loadDnc(): Promise<Dnc[]> {
  const { data } = await supabase.from('reception_dnc').select('id,phone,reason,created_at').order('created_at', { ascending: false });
  return (data ?? []) as Dnc[];
}
export async function addDnc(userId: string, phone: string, reason: string) {
  const { error } = await supabase.from('reception_dnc').upsert({ user_id: userId, phone, reason }, { onConflict: 'user_id,phone' });
  if (error) throw new Error("Couldn't add the number.");
}
export async function removeDnc(id: string) {
  const { error } = await supabase.from('reception_dnc').delete().eq('id', id);
  if (error) throw new Error("Couldn't remove the number.");
}
/** Chats Nexora answered or drafted and the handovers to a person, for the overview. */
export async function chatStats(days = 30): Promise<{ aiReplies: number; handovers: number; byDay: Record<string, number> }> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [m, e] = await Promise.all([
    supabase.from('conversation_messages').select('created_at').eq('sender', 'ai').eq('direction', 'out').gte('created_at', since).limit(5000),
    supabase.from('escalations').select('id', { count: 'exact', head: true }).gte('created_at', since).in('channel', ['whatsapp', 'instagram', 'facebook', 'Phone']),
  ]);
  const byDay: Record<string, number> = {};
  for (const r of (m.data ?? []) as { created_at: string }[]) { const d = r.created_at.slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1; }
  return { aiReplies: (m.data ?? []).length, handovers: e.count ?? 0, byDay };
}

export const cleanPhone = (v: string) => {
  const s = v.replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('234')) return `+${s}`;
  if (s.startsWith('0') && s.length === 11) return `+234${s.slice(1)}`;
  return s;
};
export const fillTemplate = (body: string, v: Record<string, string>) => body.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\s+([,.!?])/g, '$1').trim();
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
