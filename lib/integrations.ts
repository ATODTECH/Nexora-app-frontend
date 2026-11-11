import { supabase } from './supabase';

// Capability 2.15: Integrations and Automation Centre (same contract on the website and in the app).
// Builds on the Automation Centre from earlier capabilities: every older rule ("When a new order comes in, notify me")
// still works and shows here as a one-step workflow. New: several steps per workflow, approval for higher-risk steps,
// a step-by-step history with errors and retries, pause controls, outgoing webhooks and one view of every connection.
// The database and the engine (nexora-2.15-integrations-automation.sql, nexora-automations) enforce every rule.

const fail = (e: { message: string } | null, fallback: string) => {
  if (!e) return;
  if (/does not exist|schema cache|not find/i.test(e.message)) throw new Error('The automation centre is being set up. Try again in a few minutes.');
  const ours = /^(Only|Use|Choose|Unknown|You can|Webhook|This|Check|Set up|Give)/;
  const m = ours.test(e.message) ? e.message : e.message.replace(/^.*?: /, '');
  throw new Error(ours.test(m) ? m : fallback);
};

// ---------- Workflows ----------
export type Trigger = 'order_new' | 'order_unpaid' | 'order_confirmed' | 'lead_new' | 'enquiry_new' | 'low_stock' | 'followup_due' | 'customer_inactive';
export const TRIGGERS: { k: Trigger; label: string; days?: string; record: 'order' | 'customer' | 'enquiry' | 'product' }[] = [
  { k: 'enquiry_new', label: 'A new enquiry arrives (WhatsApp, Instagram, Facebook, website)', record: 'enquiry' },
  { k: 'lead_new', label: 'A new lead is added', record: 'customer' },
  { k: 'order_new', label: 'A new order comes in', record: 'order' },
  { k: 'order_confirmed', label: 'An order is confirmed (paid or being processed)', record: 'order' },
  { k: 'order_unpaid', label: 'An order is still unpaid after', days: 'days', record: 'order' },
  { k: 'low_stock', label: 'A product is running low', record: 'product' },
  { k: 'followup_due', label: 'A follow-up is due', record: 'customer' },
  { k: 'customer_inactive', label: "A customer hasn't ordered for", days: 'days', record: 'customer' },
];
export const triggerLabel = (k: string) => TRIGGERS.find(t => t.k === k)?.label ?? k;

export type StepType = 'notify' | 'notify_team' | 'team_task' | 'create_lead' | 'update_stock' | 'followup' | 'task' | 'tag' | 'draft_message' | 'send_webhook' | 'bulk_message' | 'mass_tag';
export type Step = { type: StepType; days?: number; text?: string; role?: string; segment?: string; priority?: 'low' | 'normal' | 'high'; approval?: boolean };
export const SEGMENTS = ['All', 'New', 'VIP', 'Active', 'Lead', 'Contacted', 'Qualified', 'Lost'];
export const TEAM_ROLES = ['sales', 'support', 'inventory', 'marketing', 'manager', 'admin', 'analyst', 'owner'];
export const STEPS: { k: StepType; label: string; hint: string; risky?: boolean; needs?: 'order' | 'customer' | 'enquiry'; days?: string; text?: string; role?: boolean; segment?: boolean }[] = [
  { k: 'create_lead', label: 'Create a lead', hint: 'Adds the person who wrote in to your customers as a lead (or marks them as one)', needs: 'enquiry' },
  { k: 'notify_team', label: 'Notify someone on the team', hint: 'Gives the next person with that role a high-priority task and a phone notification, in turn. Nobody with the role yet: the owner gets it', role: true, text: 'What they should do (use {name}, {order}, {items})' },
  { k: 'team_task', label: 'Give a team task', hint: 'A task in Team → Tasks for the next person with that role', role: true, days: 'due in days', text: 'Task (use {name}, {order}, {items})' },
  { k: 'update_stock', label: 'Update stock', hint: 'Takes the order’s items off your stock (done the moment an order is saved) and records exactly what changed', needs: 'order' },
  { k: 'notify', label: 'Notify me on my phone', hint: 'A phone notification to the owner', text: 'Message (optional)' },
  { k: 'followup', label: 'Set a follow-up on the customer', hint: 'Follow-up date and note on the customer', needs: 'customer', days: 'in days', text: 'Note (optional)' },
  { k: 'task', label: 'Add a task to my schedule', hint: 'A task in your schedule', days: 'in days', text: 'Task title (optional)' },
  { k: 'tag', label: 'Tag the customer', hint: 'Adds a tag to this customer', needs: 'customer', text: 'Tag' },
  { k: 'draft_message', label: 'Draft a message to the customer', hint: 'Waits for you: you approve and send it yourself', needs: 'customer', text: 'Message (use {name}, {order}, {total}, {business})' },
  { k: 'send_webhook', label: 'Send to my webhooks', hint: 'Sends this event to webhooks that listen for “automation” events', text: 'Note to include (optional)' },
  { k: 'bulk_message', label: 'Bulk message a customer group', hint: 'Higher risk: always waits for your approval, then prepares the message in Campaigns for everyone in the group', risky: true, segment: true, text: 'Message' },
  { k: 'mass_tag', label: 'Tag a whole customer group', hint: 'Higher risk (mass update): always waits for your approval', risky: true, segment: true, text: 'Tag' },
];
export const stepInfo = (k: string) => STEPS.find(s => s.k === k);
const roleName = (r?: string) => (!r ? 'someone' : r === 'owner' ? 'the owner' : TEAM_ROLES.includes(r) ? `the next ${r.charAt(0).toUpperCase()}${r.slice(1)} person` : `the next “${r}”`);
export function describeStep(s: Step): string {
  switch (s.type) {
    case 'notify_team': return `notify ${roleName(s.role)}${s.text ? `: “${s.text}”` : ''}`;
    case 'team_task': return `give ${roleName(s.role)} a task${s.text ? ` “${s.text}”` : ''}`;
    case 'create_lead': return 'create a lead';
    case 'update_stock': return 'update stock';
    case 'notify': return 'notify me';
    case 'followup': return `set a follow-up in ${s.days ?? 0} day${s.days === 1 ? '' : 's'}`;
    case 'task': return `add a task to my schedule${s.days ? ` in ${s.days} days` : ''}`;
    case 'tag': return `tag the customer “${s.text || ''}”`;
    case 'draft_message': return 'draft a message for my approval';
    case 'send_webhook': return 'send to my webhooks';
    case 'bulk_message': return `bulk message ${s.segment === 'All' ? 'all customers' : `the ${s.segment} group`}`;
    case 'mass_tag': return `tag ${s.segment === 'All' ? 'all customers' : `the ${s.segment} group`} “${s.text || ''}”`;
  }
  return s.type;
}

export type Workflow = {
  id: string; name: string; description: string; trigger: Trigger; trigger_days: number; action: string; action_days: number; action_text: string; steps: Step[];
  enabled: boolean; runs: number; last_run_at: string | null; created_at: string; failures: number; paused_reason: string; last_error: string; max_retries: number;
};
/** Older one-step rules show as a workflow with one step. */
export const stepsOf = (w: Pick<Workflow, 'steps' | 'action' | 'action_days' | 'action_text'>): Step[] =>
  (w.steps?.length ? w.steps : [{ type: w.action as StepType, days: w.action_days, text: w.action_text }]);
export const describeWorkflow = (w: Pick<Workflow, 'trigger' | 'trigger_days' | 'steps' | 'action' | 'action_days' | 'action_text'>) => {
  const t = TRIGGERS.find(x => x.k === w.trigger);
  const when = `${t?.label ?? w.trigger}${t?.days ? ` ${w.trigger_days} days` : ''}`;
  return `When ${when.charAt(0).toLowerCase()}${when.slice(1)}: ${stepsOf(w).map(describeStep).join(' → ')}.`;
};
export type WorkflowForm = { name: string; description: string; trigger: Trigger; trigger_days: number; steps: Step[]; max_retries: number };
export const TEMPLATES: WorkflowForm[] = [
  { name: 'New enquiry → lead → notify sales', description: 'Every new enquiry becomes a lead and the next sales person is told to call.', trigger: 'enquiry_new', trigger_days: 1, max_retries: 3,
    steps: [{ type: 'create_lead' }, { type: 'notify_team', role: 'sales', text: 'Reply to {name} about their enquiry' }] },
  { name: 'Confirmed order → update stock → notify fulfilment', description: 'When an order is paid or being processed, stock is checked and the next inventory person packs it.', trigger: 'order_confirmed', trigger_days: 1, max_retries: 3,
    steps: [{ type: 'update_stock' }, { type: 'notify_team', role: 'inventory', text: 'Pack and send order {order} for {name}' }] },
  { name: 'New order → tell my systems', description: 'Sends every new order to your webhooks (for example your accounting or delivery app).', trigger: 'order_new', trigger_days: 1, max_retries: 3,
    steps: [{ type: 'send_webhook' }] },
  { name: 'Unpaid after 2 days → reminder for my approval', description: 'Drafts a friendly payment reminder; nothing is sent until you approve it.', trigger: 'order_unpaid', trigger_days: 2, max_retries: 3,
    steps: [{ type: 'draft_message', text: 'Hi {name}, a friendly reminder that order {order} ({total}) is waiting for payment. Reply here if you need our payment details again. Thank you!' }] },
  { name: 'Quiet customers → win-back message (approval needed)', description: 'Customers who haven’t ordered for 60 days: a bulk message waits for your approval.', trigger: 'customer_inactive', trigger_days: 60, max_retries: 3,
    steps: [{ type: 'tag', text: 'Win back' }, { type: 'bulk_message', segment: 'Active', text: 'We miss you at {business}! Here is something new for you this week.' }] },
];
export async function loadWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase.from('automations').select('*').order('created_at');
  fail(error, "Couldn't load workflows.");
  return (data ?? []) as Workflow[];
}
export async function saveWorkflow(userId: string, f: WorkflowForm, id?: string) {
  const name = f.name.trim();
  if (name.length < 2) throw new Error('Give the workflow a name.');
  if (!f.steps.length) throw new Error('Add at least one step.');
  for (const s of f.steps) {
    if ((s.type === 'notify_team' || s.type === 'team_task') && !s.role) throw new Error('Choose who on the team gets it.');
    if ((s.type === 'tag' || s.type === 'mass_tag') && !(s.text || '').trim()) throw new Error('Type the tag to add.');
    if (s.type === 'bulk_message' && !(s.text || '').trim()) throw new Error('Type the message to send.');
  }
  const row = { name: name.slice(0, 120), description: f.description.trim().slice(0, 300), trigger: f.trigger, trigger_days: Math.min(365, Math.max(1, f.trigger_days || 1)), steps: f.steps, max_retries: f.max_retries };
  const { error } = id ? await supabase.from('automations').update(row).eq('id', id) : await supabase.from('automations').insert({ ...row, user_id: userId, action: 'notify' });
  if (error && /50 automations/.test(error.message)) throw new Error('You can have up to 50 workflows.');
  fail(error, "Couldn't save the workflow.");
}
export async function setWorkflowOn(id: string, enabled: boolean) { const { error } = await supabase.from('automations').update({ enabled }).eq('id', id); fail(error, "Couldn't change it."); }
export async function deleteWorkflow(id: string) { const { error } = await supabase.from('automations').delete().eq('id', id); fail(error, "Couldn't delete it."); }
export async function setPaused(paused: boolean) { const { error } = await supabase.rpc('set_automations_paused', { p_paused: paused }); fail(error, "Couldn't change it."); }

// ---------- Run history and approvals ----------
export type RunStatus = 'done' | 'awaiting_approval' | 'approved' | 'dismissed' | 'failed' | 'running' | 'retrying' | 'rejected';
export type LogLine = { at: string; step: number; type?: string; status: string; detail: string };
export type Run = {
  id: string; automation_id: string; title: string; detail: string; status: RunStatus; payload: Record<string, any>; created_at: string; updated_at: string;
  log: LogLine[]; step_index: number; attempts: number; next_retry_at: string | null; error: string; resumable: boolean; finished_at: string | null;
};
export const RUN_STATUS: Record<RunStatus, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-success-soft text-success-strong' },
  awaiting_approval: { label: 'Waiting for you', cls: 'bg-warning-soft text-warning-strong' },
  approved: { label: 'Approved', cls: 'bg-brand-soft text-brand' },
  running: { label: 'Running', cls: 'bg-brand-soft text-brand' },
  retrying: { label: 'Will try again', cls: 'bg-warning-soft text-warning-strong' },
  failed: { label: 'Failed', cls: 'bg-danger-soft text-danger-strong' },
  rejected: { label: 'Rejected', cls: 'bg-surface text-muted' },
  dismissed: { label: 'Dismissed', cls: 'bg-surface text-muted' },
};
export async function loadRuns(limit = 150): Promise<Run[]> {
  const { data, error } = await supabase.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  fail(error, "Couldn't load the history.");
  return (data ?? []) as Run[];
}
export async function decideRun(id: string, approve: boolean) { const { error } = await supabase.rpc('decide_automation_run', { p_id: id, p_approve: approve }); fail(error, "Couldn't save your decision."); }
export async function retryRun(id: string) { const { error } = await supabase.rpc('retry_automation_run', { p_id: id }); fail(error, "Couldn't try again."); }
/** A drafted message: open WhatsApp or email with it (the owner sends it), then mark the run approved so the next steps continue. */
export function sendDraftLink(r: Run, via: 'whatsapp' | 'email'): string | null {
  const p = r.payload || {};
  const phone = String(p.phone || '').replace(/\D/g, '');
  const msg = String(p.message || '');
  if (via === 'whatsapp' && phone.length >= 7) return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  if (via === 'email' && p.email) return `mailto:${p.email}?body=${encodeURIComponent(msg)}`;
  return null;
}

// ---------- Webhooks ----------
export type WebhookEvent = 'order.created' | 'order.paid' | 'order.status_changed' | 'lead.created' | 'customer.created' | 'enquiry.created' | 'automation';
export const EVENTS: { k: WebhookEvent; label: string }[] = [
  { k: 'order.created', label: 'New order' }, { k: 'order.paid', label: 'Order paid' }, { k: 'order.status_changed', label: 'Order status changed' },
  { k: 'lead.created', label: 'New lead' }, { k: 'customer.created', label: 'New customer' }, { k: 'enquiry.created', label: 'New enquiry' },
  { k: 'automation', label: 'Sent by a workflow step' },
];
export type Webhook = { id: string; name: string; url: string; events: WebhookEvent[]; enabled: boolean; failures: number; disabled_reason: string; last_status: number | null; last_at: string | null; secret_hint: string; created_at: string };
export type Delivery = { id: string; endpoint_id: string; event: string; status: 'pending' | 'sending' | 'delivered' | 'retrying' | 'failed'; attempts: number; next_attempt_at: string; response_code: number | null; error: string; duration_ms: number | null; created_at: string; delivered_at: string | null; payload: Record<string, any> };
export async function loadWebhooks(): Promise<{ hooks: Webhook[]; deliveries: Delivery[] }> {
  const [h, d] = await Promise.all([
    supabase.from('webhook_endpoints').select('*').order('created_at'),
    supabase.from('webhook_deliveries').select('id,endpoint_id,event,status,attempts,next_attempt_at,response_code,error,duration_ms,created_at,delivered_at,payload').order('created_at', { ascending: false }).limit(100),
  ]);
  fail(h.error, "Couldn't load webhooks.");
  return { hooks: (h.data ?? []) as Webhook[], deliveries: (d.data ?? []) as Delivery[] };
}
export async function createWebhook(name: string, url: string, events: WebhookEvent[]): Promise<string> {
  if (!/^https:\/\//i.test(url.trim())) throw new Error('Use an address that starts with https://');
  if (!events.length) throw new Error('Choose at least one event to send.');
  const { data, error } = await supabase.rpc('create_webhook', { p_name: name.trim(), p_url: url.trim(), p_events: events });
  fail(error, "Couldn't add the webhook.");
  return String((data as { secret: string }).secret);
}
export async function updateWebhook(id: string, p: { name?: string; url?: string; events?: WebhookEvent[]; enabled?: boolean }) {
  const { error } = await supabase.rpc('update_webhook', { p_id: id, p_name: p.name ?? null, p_url: p.url ?? null, p_events: p.events ?? null, p_enabled: p.enabled ?? null });
  fail(error, "Couldn't save the webhook.");
}
export async function deleteWebhook(id: string) { const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id); fail(error, "Couldn't delete the webhook."); }
export async function rotateSecret(id: string): Promise<string> { const { data, error } = await supabase.rpc('rotate_webhook_secret', { p_id: id }); fail(error, "Couldn't make a new secret."); return String(data); }
export async function testWebhook(id: string) { const { error } = await supabase.rpc('send_test_webhook', { p_id: id }); fail(error, "Couldn't send the test."); }
export async function resendDelivery(id: string) { const { error } = await supabase.rpc('resend_webhook_delivery', { p_id: id }); fail(error, "Couldn't send it again."); }

// ---------- Connections ----------
export type Status = {
  is_owner: boolean; paused: boolean;
  messaging: { key: string; connected: boolean; handle: string | null; since: string | null }[];
  social: { platform: string; name: string; handle: string; status: string; note: string }[];
  websites: { id: string; name: string; url: string; platform: string; method: string; status: string; events: number; last_event_at: string | null; last_error: string; last_error_at: string | null }[];
  shop: null | { slug: string; enabled: boolean; accept_orders: boolean; domain: string | null; domain_status: string | null; views: number; orders: number; ga_id: string; meta_pixel_id: string };
  payments: { paystack: boolean; paystack_mode: string; pay_link: boolean; bank: boolean; pay_on_delivery: boolean };
  telephony: { on: boolean; provider: string; number: string; calls_30d: number };
  analytics: { ga_id: string; meta_pixel_id: string; site_views_30d: number };
  webhooks: { total: number; on: number; failing: number };
  automations: { total: number; on: number; waiting: number; failed_7d: number };
};
export async function loadStatus(): Promise<Status> {
  const { data, error } = await supabase.rpc('integration_status');
  fail(error, "Couldn't load your connections.");
  return data as Status;
}
export async function saveAnalytics(ga: string, pixel: string) { const { error } = await supabase.rpc('set_shop_analytics', { p_ga: ga, p_pixel: pixel }); fail(error, "Couldn't save the IDs."); }
