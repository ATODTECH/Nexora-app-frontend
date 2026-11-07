import { supabase } from './supabase';

// Team roles and permissions. Same rules as the database (nx_role_permissions / staff_can) and the website's
// src/lib/team.ts. The database enforces every permission; these helpers only decide what each person's screens show.
export type Perm =
  | 'orders_view' | 'orders_manage' | 'customers_view' | 'customers_manage' | 'customers_sensitive' | 'products_view' | 'products_manage'
  | 'knowledge_manage' | 'inbox_view' | 'inbox_manage' | 'marketing_view' | 'marketing_manage' | 'export' | 'team_manage' | 'approvals_manage';
export type Perms = Partial<Record<Perm, boolean>>;
export type JobRole = 'owner' | 'admin' | 'manager' | 'sales' | 'support' | 'inventory' | 'marketing' | 'analyst' | 'custom';
export type StaffRole = Exclude<JobRole, 'owner'>;

export const ROLES: { key: StaffRole; label: string; blurb: string }[] = [
  { key: 'admin', label: 'Admin', blurb: 'Everything except billing and ownership, including managing the team' },
  { key: 'manager', label: 'Manager', blurb: 'Runs day-to-day work in every area and approves team requests, but can’t manage the team' },
  { key: 'sales', label: 'Sales', blurb: 'Orders, customers and the inbox' },
  { key: 'support', label: 'Support', blurb: 'Inbox and customers; can see orders' },
  { key: 'inventory', label: 'Inventory', blurb: 'Products, stock and orders' },
  { key: 'marketing', label: 'Marketing', blurb: 'Campaigns; can see customers and products' },
  { key: 'analyst', label: 'Analyst', blurb: 'Can see everything, change nothing' },
  { key: 'custom', label: 'Custom', blurb: 'You choose exactly what they can do' },
];
export const roleLabel = (r?: string | null) => (r === 'owner' ? 'Owner' : ROLES.find(x => x.key === r)?.label ?? 'Custom');

export const AREAS: { key: 'orders' | 'customers' | 'products' | 'inbox' | 'marketing'; label: string; see: string; manage: string }[] = [
  { key: 'orders', label: 'Orders', see: 'See orders', manage: 'Record orders, ship, mark paid' },
  { key: 'customers', label: 'Customers & leads', see: 'See customers and leads', manage: 'Add and update customers, notes, follow-ups' },
  { key: 'products', label: 'Products & stock', see: 'See products and stock', manage: 'Edit products, add stock, correct counts' },
  { key: 'inbox', label: 'Inbox', see: 'Read conversations', manage: 'Reply to customers' },
  { key: 'marketing', label: 'Marketing', see: 'See campaigns', manage: 'Create and run campaigns' },
];
export const EXTRAS: { key: Perm; label: string; sub: string; ownerOnly?: boolean }[] = [
  { key: 'knowledge_manage', label: 'Train AI', sub: 'Edit policies, FAQs and how the business works' },
  { key: 'customers_sensitive', label: 'See contact details', sub: 'See customers’ phone numbers, emails, addresses and birthdays (each look is logged)' },
  { key: 'export', label: 'Export data', sub: 'Download orders, customers and other lists' },
  { key: 'team_manage', label: 'Manage the team', sub: 'Invite, change access, suspend, and see the activity log', ownerOnly: true },
  { key: 'approvals_manage', label: 'Approve team requests', sub: 'Approve or reject refunds, cancellations, stock corrections, campaign posts and bulk messages', ownerOnly: true },
];

const ALL_MANAGE: Perm[] = ['orders_manage', 'customers_manage', 'products_manage', 'knowledge_manage', 'inbox_manage', 'marketing_manage', 'export'];
const PRESETS: Record<Exclude<StaffRole, 'custom'>, Perm[]> = {
  admin: [...ALL_MANAGE, 'customers_sensitive', 'team_manage', 'approvals_manage'],
  manager: [...ALL_MANAGE, 'customers_sensitive', 'approvals_manage'],
  sales: ['orders_manage', 'customers_manage', 'customers_sensitive', 'products_view', 'inbox_manage', 'export'],
  support: ['inbox_manage', 'customers_manage', 'customers_sensitive', 'orders_view', 'products_view'],
  inventory: ['products_manage', 'orders_manage'],
  marketing: ['marketing_manage', 'customers_view', 'products_view'],
  analyst: ['orders_view', 'customers_view', 'products_view', 'inbox_view', 'marketing_view', 'export'],
};
export function withViews(p: Perms): Perms {
  const out: Perms = { ...p };
  for (const a of AREAS) if (out[`${a.key}_manage` as Perm]) out[`${a.key}_view` as Perm] = true;
  return out;
}
export const presetPerms = (r: Exclude<StaffRole, 'custom'>): Perms => withViews(Object.fromEntries(PRESETS[r].map(k => [k, true])));

// ---- What the signed-in person can do ----
type WorkspaceLike = { role: 'owner' | 'staff'; name?: string; job_role?: string; permissions?: Record<string, boolean> | null; member_status?: string } | null;
export type Access = { isOwner: boolean; suspended: boolean; role: JobRole; can: (p: Perm) => boolean; businessName: string };
export function accessOf(ws: WorkspaceLike): Access {
  const isOwner = !ws || ws.role === 'owner';
  const suspended = !isOwner && ws?.member_status === 'suspended';
  const perms = (ws?.permissions ?? {}) as Perms;
  return { isOwner, suspended, role: isOwner ? 'owner' : ((ws?.job_role as JobRole) || 'custom'), businessName: ws?.name || '', can: p => isOwner || (!suspended && !!perms[p]) };
}

// ---- Team ----
export type TeamMember = {
  member_id: string; user_id: string; full_name: string; email: string; role: 'owner' | 'staff'; status: 'active' | 'suspended';
  joined_at: string; is_me: boolean; job_role: JobRole; permissions: Perms | null; last_active_at: string | null;
};
const friendly = (e: { message: string } | null, fallback: string) =>
  e ? new Error(/owner|admin|seat|plan|role|team|found|Choose/i.test(e.message) ? e.message.replace(/^.*?: /, '') : fallback) : null;

export async function loadTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('business_team');
  if (error) throw new Error("Couldn't load your team.");
  return (data ?? []) as TeamMember[];
}
export async function setMemberAccess(memberId: string, role: StaffRole, perms?: Perms) {
  const { error } = await supabase.rpc('set_member_access', { p_member: memberId, p_job_role: role, p_permissions: role === 'custom' ? withViews(perms ?? {}) : null });
  const e = friendly(error, "Couldn't change their access."); if (e) throw e;
}
export async function setMemberStatus(memberId: string, status: 'active' | 'suspended') {
  const { error } = await supabase.rpc('set_member_status', { p_member: memberId, p_status: status });
  const e = friendly(error, status === 'active' ? "Couldn't reactivate them." : "Couldn't suspend them."); if (e) throw e;
}
export async function removeMember(memberId: string) {
  const { error } = await supabase.rpc('remove_member', { p_member: memberId });
  const e = friendly(error, "Couldn't remove that person."); if (e) throw e;
}
export async function createInvite(role: StaffRole = 'custom'): Promise<string> {
  const { data, error } = await supabase.rpc('create_staff_invite', { p_job_role: role });
  const e = friendly(error, "Couldn't create an invite."); if (e) throw e;
  return String(data ?? '');
}
export type PendingInvite = { id: string; code: string; job_role: StaffRole; expires_at: string };
export async function loadInvites(): Promise<PendingInvite[]> {
  const { data } = await supabase.from('staff_invites').select('id,code,job_role,expires_at').is('used_by', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
  return (data ?? []) as PendingInvite[];
}
export async function cancelInvite(id: string) {
  const { data, error } = await supabase.from('staff_invites').delete().eq('id', id).select('id');
  if (error || !data?.length) throw new Error("Couldn't cancel that invite.");
}

// ---- Activity log ----
export type ActivityAction = 'team' | 'order' | 'payment' | 'refund' | 'stock' | 'product' | 'customer' | 'campaign' | 'export' | 'invite' | 'approval';
export type Activity = { id: string; actor_id: string | null; actor_name: string; action: ActivityAction; summary: string; created_at: string };
export const ACTION_LABEL: Record<ActivityAction, string> = {
  team: 'Team', invite: 'Team', order: 'Orders', payment: 'Payments', refund: 'Refunds', stock: 'Stock', product: 'Products', customer: 'Customers', campaign: 'Campaigns', export: 'Exports', approval: 'Approvals',
};
export async function loadActivity(opts: { before?: string; actorId?: string; actions?: ActivityAction[] } = {}, limit = 50): Promise<Activity[]> {
  let q = supabase.from('audit_log').select('id,actor_id,actor_name,action,summary,created_at').order('created_at', { ascending: false }).limit(limit);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.actorId) q = q.eq('actor_id', opts.actorId);
  if (opts.actions?.length) q = q.in('action', opts.actions);
  const { data, error } = await q;
  if (error) throw new Error("Couldn't load the activity log.");
  return (data ?? []) as Activity[];
}
/** Exports happen on the phone, so the screen records them in the activity log. */
export const logExport = (what: string, count: number) => { supabase.rpc('log_export', { p_what: what, p_count: count }).then(() => {}, () => {}); };

// ---- Which screens a team member can open ----
// Screens not listed are open to everyone on the team. 'owner': only the owner. Same areas as the website's pages.
const SCREEN_NEEDS: Record<string, Perm[] | 'owner'> = {
  orders: ['orders_view'],
  customers: ['customers_view'], customersLive: ['customers_view'], customerDetail: ['customers_view'], customerProfile: ['customers_view'],
  addCustomer: ['customers_manage'], interactionHistory: ['customers_view'], leads: ['customers_view'], leadDetail: ['customers_view'], followups: ['customers_view'], crm: ['customers_view'],
  inboxChat: ['inbox_view'], 'tab:inbox': ['inbox_view'],
  campaigns: ['marketing_view'], broadcast: ['inbox_manage'],
  activityLog: ['team_manage'],
  insights: 'owner', automations: 'owner', rules: 'owner', ownerAlerts: 'owner', learned: 'owner', storefront: 'owner', connectChannels: 'owner',
  channelSettings: 'owner', aiPermissions: 'owner', brainGallery: 'owner', brainAssistant: 'owner', businessPlanner: 'owner', socialPublisher: 'owner', websiteIntegration: 'owner', aiMarketing: 'owner', 'tab:brain': 'owner', quickActions: 'owner',
};
export function canOpenScreen(a: Access, screen: string, mainTab?: string): boolean {
  if (a.isOwner) return true;
  if (a.suspended) return screen === 'settings' || (screen === 'main' && mainTab === 'profile');
  const need = SCREEN_NEEDS[screen === 'main' ? `tab:${mainTab}` : screen];
  if (!need) return true;
  return need !== 'owner' && need.some(p => a.can(p));
}
