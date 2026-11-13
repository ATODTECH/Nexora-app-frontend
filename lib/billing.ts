import { callNexora as callFn } from './autopilot';
import { supabase } from './supabase';

// Plans, billing and add-ons (capability 2.16) in the app. The same data and rules as the website's src/lib/billing.ts:
// the server decides everything about money (paystack-checkout, nexora-billing); the app only reads what the owner may see
// and asks the server to act.

export type Billing = {
  plan: string; effective_plan: string; status: string; interval: 'month' | 'year' | null;
  period_start: string | null; period_end: string | null; auto_renew: boolean; cancel_at_period_end: boolean; pending_plan: string | null;
  payment_failures: number; last_payment_error: string | null; next_charge_at: string | null; in_grace: boolean;
  card: { brand: string | null; last4: string | null; exp_month: string | null; exp_year: string | null; bank: string | null } | null;
  addons: { key: string; name: string; kind: string; quantity: number; ends_at: string }[];
};
export type Payment = {
  id: string; reference: string; kind: 'plan' | 'renewal' | 'addon'; plan_key: string | null; addon_key: string | null; interval: string | null;
  description: string; amount: number; currency: string; credit_note: string | null; status: 'pending' | 'success' | 'failed' | 'abandoned';
  channel: string | null; card_brand: string | null; card_last4: string | null; failure_reason: string | null;
  period_start: string | null; period_end: string | null; invoice_number: string | null; paid_at: string | null; created_at: string;
};
export type Addon = {
  key: string; name: string; description: string; kind: string; quantity: number; price_ngn: number | null; price_usd: number | null;
  lasts: 'month_end' | '30_days'; value_note: string; cost_note: string; plans: string[]; active: boolean;
};
export type Quote = { kind: 'new' | 'upgrade' | 'extend' | 'downgrade'; amount: number; currency: string; interval: string; starts: string; ends: string; bonus_days: number; credit: number; text: string };
export type FitIssue = { kind: string; used: number; limit: number };
export type BillingAlert = { key: string; title: string; sub: string; action: string } | null;

/** Every usage meter, in the order the Plans & billing screen shows them. */
export const USAGE_ORDER = ['ai_tasks', 'users', 'connected_accounts', 'customer_records', 'active_workflows', 'knowledge_sources', 'posts_published', 'call_minutes', 'storage_mb'] as const;
export const USAGE_LABELS: Record<string, string> = {
  ai_tasks: 'AI tasks this month', users: 'Team members (including you)', connected_accounts: 'Connected accounts', customer_records: 'Customer records',
  active_workflows: 'Active automations', knowledge_sources: 'Knowledge documents', posts_published: 'Posts published this month',
  call_minutes: 'AI Receptionist call minutes this month', storage_mb: 'Storage used (MB)',
};
/** Which add-on raises which limit. */
export const ADDON_FOR: Record<string, string> = { ai_tasks: 'ai_tasks_1000', users: 'extra_user', connected_accounts: 'extra_account', call_minutes: 'call_minutes_100' };

const rpcMessage = (e: unknown, fallback: string) => String((e as { message?: string })?.message || fallback).replace(/^.*?exception:\s*/i, '');

export async function loadBilling(): Promise<Billing | null> {
  const { data, error } = await supabase.rpc('my_billing');
  return error ? null : ((data as Billing | null) ?? null);
}
export async function loadBillingAlert(): Promise<BillingAlert> {
  const { data, error } = await supabase.rpc('my_billing_alert');
  return error ? null : ((data as BillingAlert) ?? null);
}
export async function loadPayments(): Promise<Payment[]> {
  const { data } = await supabase.from('billing_payments').select('*').in('status', ['success', 'failed']).order('created_at', { ascending: false }).limit(100);
  return ((data ?? []) as Payment[]).map(p => ({ ...p, amount: Number(p.amount) }));
}
export async function loadAddons(): Promise<Addon[]> {
  const { data } = await supabase.from('billing_addons').select('*').order('sort');
  return ((data ?? []) as Addon[]).map(a => ({ ...a, price_ngn: a.price_ngn == null ? null : Number(a.price_ngn), price_usd: a.price_usd == null ? null : Number(a.price_usd) }));
}
export const quotePlan = (plan: string, interval: 'month' | 'year') => callFn<Quote & { success: boolean }>('paystack-checkout', { action: 'quote', plan, interval });
export async function planFit(plan: string): Promise<FitIssue[]> {
  const { data } = await supabase.rpc('plan_fit', { p_plan: plan });
  return (data as FitIssue[] | null) ?? [];
}
/** Downgrade at renewal ('starter'), cancel at the end of the period ('free'), or keep the current plan (its own key). */
export async function changePlan(plan: string): Promise<{ action: 'kept' | 'cancel' | 'switch'; on?: string; over?: FitIssue[] }> {
  const { data, error } = await supabase.rpc('billing_change_plan', { p_plan: plan });
  if (error) throw new Error(rpcMessage(error, "Couldn't change the plan."));
  return data as { action: 'kept' | 'cancel' | 'switch'; on?: string; over?: FitIssue[] };
}
export async function setAutoRenew(on: boolean) {
  const { error } = await supabase.rpc('billing_set_auto_renew', { p_on: on });
  if (error) throw new Error(rpcMessage(error, "Couldn't change automatic renewal."));
}
export async function removeCard() {
  const { error } = await supabase.rpc('billing_remove_card');
  if (error) throw new Error(rpcMessage(error, "Couldn't remove the card."));
}
export const payWithSavedCard = () => callFn<{ status: string; plan_name?: string; current_period_end?: string }>('paystack-checkout', { action: 'charge_saved' }, 60000);

export const fmtMoney = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
};
export const fmtDay = (t: string | number | null | undefined) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const cardLabel = (c: { brand?: string | null; last4?: string | null } | null | undefined) =>
  c?.last4 ? `${c.brand ? `${c.brand.charAt(0).toUpperCase()}${c.brand.slice(1)} ` : 'Card '}ending ${c.last4}` : 'Card';
/** A paid plan that ran out without being renewed: the business is on the Free limits until it pays. */
export const planEnded = (b: Billing | null) => !!b && b.plan !== 'free' && b.effective_plan === 'free';
