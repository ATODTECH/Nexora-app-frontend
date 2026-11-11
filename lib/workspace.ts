import { supabase } from './supabase';
import { withViews, type Perms } from './team';

// Capability 2.14: Team, organisation and multi-user workspace (same contract as the website's lib/workspace.ts). Builds on the team system from earlier capabilities
// (lib/team.ts: roles, permissions, invites, seats, suspend/remove, approvals, activity log) with saved custom roles,
// "only customers assigned to them", an access review, tasks linked to records, internal notes with @mentions,
// saved views, a personal dashboard and team workflows that hand out tasks automatically.
// The database enforces every rule (nexora-2.14-team-workspace.sql); these helpers only read and write.

const fail = (e: { message: string } | null, fallback: string) => {
  if (!e) return;
  if (/team_roles|team_notes|saved_views|workspace_dashboards|team_workflows|related_type|assigned_to/.test(e.message) && /does not exist|schema cache|not find/i.test(e.message))
    throw new Error('The team workspace is being set up. Ask your admin to run the 2.14 database update, then try again.');
  throw new Error(/^(Only|Give|That|You|Someone|Role|Assign|A task)/.test(e.message.replace(/^.*?: /, '')) ? e.message.replace(/^.*?: /, '') : fallback);
};

// ---------- Saved custom roles ----------
export type TeamRole = { id: string; name: string; description: string; permissions: Perms; updated_at: string };
export async function loadRoles(): Promise<TeamRole[]> {
  const { data, error } = await supabase.from('team_roles').select('id,name,description,permissions,updated_at').order('name');
  if (error) fail(error, "Couldn't load your roles.");
  return (data ?? []) as TeamRole[];
}
export async function saveRole(r: { id?: string; name: string; description: string; permissions: Perms }): Promise<string> {
  const { data, error } = await supabase.rpc('save_team_role', { p_id: r.id ?? null, p_name: r.name, p_description: r.description, p_permissions: withViews(r.permissions) });
  fail(error, "Couldn't save the role.");
  return String(data);
}
export async function deleteRole(id: string) { const { error } = await supabase.rpc('delete_team_role', { p_id: id }); fail(error, "Couldn't delete the role."); }
export async function applyRole(memberId: string, roleId: string) { const { error } = await supabase.rpc('apply_team_role', { p_member: memberId, p_role: roleId }); fail(error, "Couldn't give that role."); }
export async function memberRoles(): Promise<Record<string, string>> {
  const { data } = await supabase.rpc('business_team_roles');
  return Object.fromEntries(((data ?? []) as { member_id: string; role_name: string | null }[]).filter(r => r.role_name).map(r => [r.member_id, r.role_name as string]));
}

// ---------- Access review ----------
export type ReviewInfo = { reviewed_at: string | null; reviewed_by: string; seats: number | null; used: number; pending: number };
export async function reviewInfo(): Promise<ReviewInfo | null> {
  const { data } = await supabase.rpc('access_review_info');
  return ((data ?? []) as ReviewInfo[])[0] ?? null;
}
export async function markReviewed() { const { error } = await supabase.rpc('mark_access_reviewed'); fail(error, "Couldn't save the review."); }

// ---------- Tasks ----------
export type TaskPriority = 'low' | 'normal' | 'high';
export type RelatedType = 'order' | 'customer' | 'product' | 'project' | 'campaign';
export type Task = {
  id: string; business_id: string; created_by: string; assigned_to: string | null; title: string; details: string; due_date: string | null;
  status: 'open' | 'done'; done_at: string | null; created_at: string; priority: TaskPriority; related_type: RelatedType | null; related_id: string | null;
  related_label: string; source: 'manual' | 'workflow'; workflow_id: string | null;
};
export async function loadTasks(businessId: string): Promise<Task[]> {
  const { data, error } = await supabase.from('team_tasks').select('*').eq('business_id', businessId).order('status').order('due_date', { ascending: true, nullsFirst: false }).limit(500);
  if (error) fail(error, "Couldn't load tasks.");
  return ((data ?? []) as Task[]).map(t => ({ ...t, priority: t.priority ?? 'normal', related_label: t.related_label ?? '', source: t.source ?? 'manual' }));
}
export type TaskForm = { title: string; details: string; assigned_to: string; due_date: string; priority: TaskPriority; related_type?: RelatedType | null; related_id?: string | null; related_label?: string };
export async function saveTask(businessId: string, me: string, f: TaskForm, id?: string) {
  const row = {
    title: f.title.trim().slice(0, 200), details: f.details.trim().slice(0, 2000), assigned_to: f.assigned_to || null, due_date: f.due_date || null, priority: f.priority,
    ...(f.related_type !== undefined ? { related_type: f.related_type || null, related_id: f.related_id || null, related_label: (f.related_label || '').slice(0, 120) } : {}),
  };
  if (row.title.length < 2) throw new Error('Say what needs doing');
  const { error } = id ? await supabase.from('team_tasks').update(row).eq('id', id) : await supabase.from('team_tasks').insert({ ...row, business_id: businessId, created_by: me });
  fail(error, "Couldn't save the task.");
}
export async function setTaskDone(id: string, done: boolean) { const { error } = await supabase.from('team_tasks').update({ status: done ? 'done' : 'open' }).eq('id', id); fail(error, "Couldn't update the task."); }
export async function deleteTask(id: string) { const { error } = await supabase.from('team_tasks').delete().eq('id', id); fail(error, "Couldn't delete the task."); }
/** Where a task's record opens on the website. */
export function relatedHref(t: Pick<Task, 'related_type' | 'related_id'>): string | null {
  if (!t.related_id) return null;
  switch (t.related_type) {
    case 'order': return `/orders?open=${t.related_id}`;
    case 'customer': return `/customers?id=${t.related_id}`;
    case 'project': return `/digital?id=${t.related_id}`;
    case 'product': return '/inventory';
    case 'campaign': return '/marketing';
    default: return null;
  }
}

// ---------- Internal notes ----------
export type NoteType = 'order' | 'customer' | 'product' | 'task';
export type Note = { id: string; author: string | null; body: string; mentions: string[]; created_at: string; entity_type: NoteType; entity_id: string };
export async function loadNotes(businessId: string, type: NoteType, id: string): Promise<Note[]> {
  const { data, error } = await supabase.from('team_notes').select('id,author,body,mentions,created_at,entity_type,entity_id').eq('business_id', businessId).eq('entity_type', type).eq('entity_id', id).order('created_at').limit(200);
  if (error) fail(error, "Couldn't load notes.");
  return (data ?? []) as Note[];
}
export async function addNote(businessId: string, type: NoteType, id: string, body: string, mentions: string[]) {
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error('Write a note first');
  const { error } = await supabase.from('team_notes').insert({ business_id: businessId, entity_type: type, entity_id: id, body: text, mentions });
  fail(error, "Couldn't add the note.");
}
export async function deleteNote(id: string) { const { error } = await supabase.from('team_notes').delete().eq('id', id); fail(error, "Couldn't delete the note."); }
/** Notes that mention me, newest first (for My work). */
export async function myMentions(businessId: string, me: string): Promise<Note[]> {
  const { data } = await supabase.from('team_notes').select('id,author,body,mentions,created_at,entity_type,entity_id').eq('business_id', businessId).contains('mentions', [me]).order('created_at', { ascending: false }).limit(20);
  return (data ?? []) as Note[];
}
export function noteHref(n: Pick<Note, 'entity_type' | 'entity_id'>): string {
  return n.entity_type === 'order' ? `/orders?open=${n.entity_id}` : n.entity_type === 'customer' ? `/customers?id=${n.entity_id}` : n.entity_type === 'product' ? '/inventory' : '/team?tab=tasks';
}

// ---------- Saved views ----------
export type ViewPage = 'orders' | 'customers' | 'tasks';
export type SavedView = { id: string; user_id: string; page: ViewPage; name: string; params: Record<string, string>; shared: boolean };
export async function loadViews(businessId: string, page: ViewPage): Promise<SavedView[]> {
  const { data } = await supabase.from('saved_views').select('id,user_id,page,name,params,shared').eq('business_id', businessId).eq('page', page).order('created_at');
  return (data ?? []) as SavedView[];
}
export async function saveView(businessId: string, page: ViewPage, name: string, params: Record<string, string>, shared: boolean) {
  const n = name.trim().slice(0, 40);
  if (!n) throw new Error('Give the view a name');
  const { error } = await supabase.from('saved_views').insert({ business_id: businessId, page, name: n, params, shared });
  fail(error, "Couldn't save the view.");
}
export async function deleteView(id: string) { const { error } = await supabase.from('saved_views').delete().eq('id', id); fail(error, "Couldn't delete the view."); }

// ---------- Personal dashboard ----------
export type Tile = 'my_tasks' | 'team_tasks' | 'overdue' | 'mentions' | 'to_ship' | 'unpaid' | 'new_leads' | 'my_customers' | 'approvals' | 'low_stock' | 'activity';
export const TILES: { k: Tile; label: string; hint: string; needs?: string }[] = [
  { k: 'my_tasks', label: 'My tasks', hint: 'Open tasks given to you' },
  { k: 'overdue', label: 'Overdue tasks', hint: 'Tasks past their due date across the team' },
  { k: 'mentions', label: 'Mentions', hint: 'Notes where someone mentioned you' },
  { k: 'team_tasks', label: 'Team tasks', hint: 'Open tasks by person' },
  { k: 'to_ship', label: 'Orders to ship', hint: 'Orders waiting to go out', needs: 'orders_view' },
  { k: 'unpaid', label: 'Unpaid orders', hint: 'Orders not paid yet', needs: 'orders_view' },
  { k: 'new_leads', label: 'New leads', hint: 'Leads in the last 7 days', needs: 'customers_view' },
  { k: 'my_customers', label: 'My customers', hint: 'Customers assigned to you', needs: 'customers_view' },
  { k: 'approvals', label: 'Approvals', hint: 'Requests waiting for a decision', needs: 'approvals_manage' },
  { k: 'low_stock', label: 'Low stock', hint: 'Products running low', needs: 'products_view' },
  { k: 'activity', label: 'Team activity', hint: 'What the team did last', needs: 'team_manage' },
];
export const DEFAULT_TILES: Tile[] = ['my_tasks', 'overdue', 'mentions', 'to_ship', 'new_leads', 'approvals'];
export async function loadDashboard(): Promise<Tile[] | null> {
  const { data } = await supabase.from('workspace_dashboards').select('tiles').maybeSingle();
  return data ? ((data as { tiles: Tile[] }).tiles ?? []) : null;
}
export async function saveDashboard(businessId: string, me: string, tiles: Tile[]) {
  const { error } = await supabase.from('workspace_dashboards').upsert({ user_id: me, business_id: businessId, tiles, updated_at: new Date().toISOString() });
  fail(error, "Couldn't save your dashboard.");
}

// ---------- Team workflows ----------
export type WfTrigger = 'new_order' | 'order_paid' | 'new_lead';
export const TRIGGERS: { k: WfTrigger; label: string; example: string }[] = [
  { k: 'new_order', label: 'A new order comes in', example: 'Pack order {record}' },
  { k: 'order_paid', label: 'An order is paid', example: 'Send thank-you and delivery date for {record}' },
  { k: 'new_lead', label: 'A new lead arrives', example: 'Call {record} within the day' },
];
export type Workflow = {
  id: string; name: string; trigger: WfTrigger; assign_mode: 'member' | 'role' | 'owner'; assign_to: string | null; assign_role: string | null;
  task_title: string; due_days: number; priority: TaskPriority; assign_record: boolean; enabled: boolean; runs: number; last_run_at: string | null;
};
export async function loadWorkflows(businessId: string): Promise<Workflow[]> {
  const { data, error } = await supabase.from('team_workflows').select('*').eq('business_id', businessId).order('created_at');
  if (error) fail(error, "Couldn't load workflows.");
  return (data ?? []) as Workflow[];
}
export type WorkflowForm = Omit<Workflow, 'id' | 'runs' | 'last_run_at'>;
export async function saveWorkflow(businessId: string, f: WorkflowForm, id?: string) {
  const row = { ...f, name: f.name.trim().slice(0, 80), task_title: f.task_title.trim().slice(0, 160), assign_to: f.assign_mode === 'member' ? f.assign_to : null, assign_role: f.assign_mode === 'role' ? f.assign_role : null };
  if (row.name.length < 2) throw new Error('Give the workflow a name');
  if (row.task_title.length < 2) throw new Error('Write the task to create');
  if (row.assign_mode === 'member' && !row.assign_to) throw new Error('Choose who gets the task');
  if (row.assign_mode === 'role' && !row.assign_role) throw new Error('Choose the role');
  const { error } = id ? await supabase.from('team_workflows').update(row).eq('id', id) : await supabase.from('team_workflows').insert({ ...row, business_id: businessId });
  fail(error, "Couldn't save the workflow.");
}
export async function setWorkflowOn(id: string, enabled: boolean) { const { error } = await supabase.from('team_workflows').update({ enabled }).eq('id', id); fail(error, "Couldn't update the workflow."); }
export async function deleteWorkflow(id: string) { const { error } = await supabase.from('team_workflows').delete().eq('id', id); fail(error, "Couldn't delete the workflow."); }

// ---------- Customers: who looks after them ----------
export async function assignCustomer(customerId: string, userId: string | null) {
  const { error } = await supabase.from('customers').update({ assigned_to: userId }).eq('id', customerId);
  fail(error, "Couldn't change who looks after this customer.");
}
