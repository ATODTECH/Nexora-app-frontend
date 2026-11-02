import { supabase } from './supabase';

// Team approvals. Same rules as the database (request_approval / decide_approval) and the website's src/lib/approvals.ts.
// A team member asks; the owner or someone with "Approve team requests" decides; on approval the database carries the action out.
export type ApprovalKind = 'order_cancel' | 'refund' | 'stock_correct' | 'campaign_post' | 'bulk_message';
export type ApprovalStatus = 'pending' | 'approved' | 'sending' | 'done' | 'rejected' | 'withdrawn' | 'expired' | 'not_needed' | 'failed';
export type Approval = {
  id: string; kind: ApprovalKind; target_id: string | null; title: string; detail: string; reason: string;
  requested_by: string; requester_name: string; status: ApprovalStatus; decider_name: string; decision_note: string;
  decided_at: string | null; created_at: string; expires_at: string; result: { sent?: number; failed?: number; message?: string };
};
export type ApprovalRules = Record<ApprovalKind, boolean>;
type CallFn = (name: string, body: Record<string, unknown>, ms?: number) => Promise<any>;

export const KINDS: { key: ApprovalKind; label: string; sub: string }[] = [
  { key: 'order_cancel', label: 'Cancelling an order', sub: 'Its items go back into stock once approved' },
  { key: 'refund', label: 'Recording a refund', sub: 'Only on paid orders, up to what was paid' },
  { key: 'stock_correct', label: 'Correcting a stock count', sub: 'Adding received stock never needs approval' },
  { key: 'campaign_post', label: 'Posting a campaign', sub: 'Shares it on your shop and marks it as posted' },
  { key: 'bulk_message', label: 'Messaging many customers', sub: 'The same message to 3 or more chats' },
];
export const ALL_ON: ApprovalRules = { order_cancel: true, refund: true, stock_correct: true, campaign_post: true, bulk_message: true };

export const STATUS_TEXT: Record<ApprovalStatus, string> = {
  pending: 'Waiting', approved: 'Approved · sending', sending: 'Sending', done: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn',
  expired: 'Expired', not_needed: 'No longer needed', failed: 'Approved · not sent',
};
export const STATUS_COLORS: Record<ApprovalStatus, { bg: string; fg: string }> = {
  pending: { bg: '#FFF6E5', fg: '#C2760C' }, approved: { bg: '#EAF1FB', fg: '#1E56A0' }, sending: { bg: '#EAF1FB', fg: '#1E56A0' },
  done: { bg: '#E7F6EE', fg: '#1E9E6D' }, rejected: { bg: '#FDECEC', fg: '#B42318' }, withdrawn: { bg: '#F3F5F8', fg: '#5C6B7A' },
  expired: { bg: '#F3F5F8', fg: '#5C6B7A' }, not_needed: { bg: '#F3F5F8', fg: '#5C6B7A' }, failed: { bg: '#FDECEC', fg: '#B42318' },
};
/** Pending and not past its 7 days. */
export const isWaiting = (a: Pick<Approval, 'status' | 'expires_at'>) => a.status === 'pending' && new Date(a.expires_at).getTime() > Date.now();

/** True when the database refused an action because it needs approval (so the screen can offer "Ask for approval"). */
export const needsApprovalError = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === 'NXAPR' || /needs approval|need approval/i.test(x?.message ?? '');
};
const clean = (e: { message: string } | null, fallback: string) => (e ? new Error(e.message && !/schema|function|column|relation/i.test(e.message) ? e.message : fallback) : null);

// The menu badge and Home recount after a request is sent, decided or withdrawn.
const listeners = new Set<() => void>();
export const onApprovalsChanged = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const changed = () => listeners.forEach(fn => fn());

const COLS = 'id,kind,target_id,title,detail,reason,requested_by,requester_name,status,decider_name,decision_note,decided_at,created_at,expires_at,result';
/** Everything the signed-in person may see: all of the business's requests for approvers, their own for everyone else (the database decides). */
export async function loadApprovals(waiting: boolean): Promise<Approval[]> {
  const now = new Date().toISOString();
  let q = supabase.from('approval_requests').select(COLS).order('created_at', { ascending: false }).limit(100);
  q = waiting ? q.eq('status', 'pending').gt('expires_at', now) : q.or(`status.neq.pending,expires_at.lte."${now}"`);
  const { data, error } = await q;
  if (error) throw new Error("Couldn't load approvals.");
  return (data ?? []) as Approval[];
}
/** Requests waiting for someone else's decision (for the badge and Home). */
export async function countWaiting(userId: string): Promise<number> {
  const { count } = await supabase.from('approval_requests').select('id', { count: 'exact', head: true })
    .eq('status', 'pending').gt('expires_at', new Date().toISOString()).neq('requested_by', userId);
  return count ?? 0;
}
/** Requests still waiting on one order, product or campaign (shown on that screen). */
export async function loadPendingFor(targetId: string): Promise<Approval[]> {
  const { data } = await supabase.from('approval_requests').select(COLS).eq('target_id', targetId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
  return (data ?? []) as Approval[];
}

export async function requestApproval(kind: ApprovalKind, targetId: string | null, payload: Record<string, unknown>, reason: string): Promise<Approval> {
  const { data, error } = await supabase.rpc('request_approval', { p_kind: kind, p_target: targetId, p_payload: payload, p_reason: reason.trim() });
  const e = clean(error, "Couldn't send the request."); if (e) throw e;
  changed();
  return data as Approval;
}
/** Approve or reject. An approved bulk message is sent straight away; the result says how many went. */
export async function decideApproval(a: Approval, approve: boolean, note: string, callFn: CallFn): Promise<{ approval: Approval; sent?: string }> {
  const { data, error } = await supabase.rpc('decide_approval', { p_id: a.id, p_approve: approve, p_note: note.trim() });
  const e = clean(error, "Couldn't save your decision."); if (e) throw e;
  const approval = data as Approval;
  changed();
  if (approve && approval.kind === 'bulk_message' && approval.status === 'approved') {
    const r = await callFn('send-message', { approval_id: approval.id }, 120000).catch((x: Error) => ({ message: x.message }));
    return { approval, sent: r?.message || 'Sending finished.' };
  }
  return { approval };
}
export async function withdrawApproval(id: string) {
  const { error } = await supabase.rpc('withdraw_approval', { p_id: id });
  const e = clean(error, "Couldn't withdraw it."); if (e) throw e;
  changed();
}

export async function loadRules(): Promise<ApprovalRules> {
  const { data } = await supabase.rpc('approval_rules');
  return { ...ALL_ON, ...((data as Partial<ApprovalRules>) ?? {}) };
}
export async function saveRules(rules: ApprovalRules): Promise<ApprovalRules> {
  const { data, error } = await supabase.rpc('set_approval_rules', { p_rules: rules });
  const e = clean(error, "Couldn't save the approval rules."); if (e) throw e;
  return { ...ALL_ON, ...((data as Partial<ApprovalRules>) ?? {}) };
}
