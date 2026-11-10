import { supabase } from './supabase';

// Capability 2.13: Software development and digital services (same contract as the website's lib/devProjects.ts). Builds on 2.12 (partners, developers, project requests,
// introductions with private contacts, reviews and reports). A digital project is between a client business and a
// developer or service partner they have an accepted introduction with:
// requirements -> AI-written brief, scope of work, technical requirements, proposal and milestone plan -> a written
// agreement (scope, milestones, total and payment terms) that both sides accept -> milestones, updates and
// deliverables -> change requests (change control) -> onboarding and maintenance.
// The database enforces the rules (see nexora-2.13-digital-projects.sql): after both sides accept, the scope, total,
// payment terms and milestones are locked and can only change through an approved change request.

export type DevKind = 'website' | 'mobile_app' | 'automation' | 'other';
export const DEV_KINDS: { k: DevKind; label: string; hint: string }[] = [
  { k: 'website', label: 'Website', hint: 'A business site, online shop, booking or landing page' },
  { k: 'mobile_app', label: 'Mobile app', hint: 'An Android or iPhone app for customers or staff' },
  { k: 'automation', label: 'Automation', hint: 'Connect tools, automate orders, messages, reports or payments' },
  { k: 'other', label: 'Other digital project', hint: 'A dashboard, internal tool, integration or anything else' },
];
export const devKindLabel = (k?: string) => DEV_KINDS.find(x => x.k === k)?.label ?? 'Digital project';

export type DevStatus = 'draft' | 'proposed' | 'active' | 'maintenance' | 'completed' | 'cancelled';
export const STATUS_LABEL: Record<DevStatus, string> = {
  draft: 'Draft', proposed: 'Waiting for agreement', active: 'In progress', maintenance: 'Maintenance', completed: 'Completed', cancelled: 'Cancelled',
};

export type Requirements = {
  goal: string; users: string; features: string[]; integrations: string[]; platforms: string; content: string;
  existing: string; budget: string; deadline: string; notes: string;
};
export const blankRequirements = (): Requirements => ({ goal: '', users: '', features: [], integrations: [], platforms: '', content: '', existing: '', budget: '', deadline: '', notes: '' });

export type DocKey = 'brief' | 'scope' | 'tech' | 'proposal' | 'plan';
export const DOCS: { k: DocKey; label: string; what: string }[] = [
  { k: 'brief', label: 'Project brief', what: 'The goal, who it is for and what success looks like' },
  { k: 'scope', label: 'Scope of work', what: 'What is included, what is not, and what will be delivered. Both sides agree to this.' },
  { k: 'tech', label: 'Technical requirements', what: 'Pages or screens, features, integrations, hosting, security and testing' },
  { k: 'proposal', label: 'Proposal', what: 'The approach, timeline, price and why this plan fits' },
  { k: 'plan', label: 'Milestone plan', what: 'The work split into milestones, each with a deliverable, date and payment' },
];
export type Doc = { text: string; at?: string; version?: number };

export type Milestone = { id: string; project_id: string; position: number; title: string; description: string; amount: number; due_date: string | null; status: 'planned' | 'in_progress' | 'submitted' | 'approved' | 'paid' };
export const MILESTONE_LABEL: Record<Milestone['status'], string> = { planned: 'Not started', in_progress: 'In progress', submitted: 'Ready for review', approved: 'Approved', paid: 'Paid' };
export type Change = { id: string; project_id: string; requested_by: string; title: string; description: string; cost_delta: number; days_delta: number; status: 'proposed' | 'approved' | 'rejected' | 'withdrawn'; decided_at: string | null; created_at: string };
export type Message = { id: string; project_id: string; sender: string | null; kind: 'message' | 'update' | 'deliverable' | 'system'; body: string; link: string; milestone_id: string | null; status: 'submitted' | 'accepted' | 'changes_requested' | null; created_at: string };
export type OnboardingItem = { label: string; done: boolean; who: 'client' | 'provider' };
export type Maintenance = { plan: 'none' | 'monthly' | 'quarterly' | 'yearly' | 'on_request'; fee: string; includes: string; starts: string; support: string };
export const MAINT_PLANS: { k: Maintenance['plan']; label: string }[] = [
  { k: 'none', label: 'No maintenance yet' }, { k: 'monthly', label: 'Monthly' }, { k: 'quarterly', label: 'Every 3 months' }, { k: 'yearly', label: 'Yearly' }, { k: 'on_request', label: 'Pay when needed' },
];
export const blankMaintenance = (): Maintenance => ({ plan: 'none', fee: '', includes: '', starts: '', support: '' });

export type DevProject = {
  id: string; client_id: string; provider_id: string | null; request_id: string | null; title: string; kind: DevKind; status: DevStatus;
  requirements: Requirements; docs: Partial<Record<DocKey, Doc>>; currency: string; total_amount: number; payment_terms: string;
  scope_version: number; client_accepted_at: string | null; provider_accepted_at: string | null; agreed_at: string | null;
  onboarding: OnboardingItem[]; maintenance: Maintenance; created_at: string; updated_at: string;
  client_name?: string; provider_name?: string;
};
export type ProjectFull = DevProject & { milestones: Milestone[]; changes: Change[]; messages: Message[] };

const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const fail = (e: { message: string } | null) => {
  if (!e) return;
  if (/dev_projects|dev_milestones|dev_changes|dev_messages|dev_accept_terms|dev_set_provider|dev_decide_change/i.test(e.message) && /does not exist|schema cache|not find/i.test(e.message))
    throw new Error('Digital projects are being set up. Ask your admin to run the 2.13 database update, then try again.');
  throw new Error(e.message);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows straight from the database
const norm = (r: any): DevProject => ({
  ...r, total_amount: Number(r.total_amount || 0), requirements: { ...blankRequirements(), ...(r.requirements || {}) }, docs: r.docs || {},
  onboarding: Array.isArray(r.onboarding) ? r.onboarding : [], maintenance: { ...blankMaintenance(), ...(r.maintenance || {}) },
});

async function names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  if (!u.length) return new Map();
  const { data } = await supabase.from('network_profiles').select('user_id,display_name').in('user_id', u);
  return new Map(((data ?? []) as { user_id: string; display_name: string }[]).map(n => [n.user_id, n.display_name]));
}

/** Projects where you are the client or the developer. */
export async function listProjects(): Promise<DevProject[]> {
  const { data, error } = await supabase.from('dev_projects').select('*').order('updated_at', { ascending: false }).limit(200);
  fail(error);
  const rows = (data ?? []).map(norm);
  const nm = await names(rows.flatMap(r => [r.client_id, r.provider_id]));
  return rows.map(r => ({ ...r, client_name: nm.get(r.client_id) || 'Client', provider_name: r.provider_id ? nm.get(r.provider_id) || 'Developer' : '' }));
}

export async function getProject(id: string): Promise<ProjectFull> {
  const [p, m, c, msg] = await Promise.all([
    supabase.from('dev_projects').select('*').eq('id', id).maybeSingle(),
    supabase.from('dev_milestones').select('*').eq('project_id', id).order('position').order('created_at'),
    supabase.from('dev_changes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('dev_messages').select('*').eq('project_id', id).order('created_at').limit(500),
  ]);
  fail(p.error); fail(m.error); fail(c.error); fail(msg.error);
  if (!p.data) throw new Error('This project was not found, or you are not part of it.');
  const proj = norm(p.data);
  const nm = await names([proj.client_id, proj.provider_id]);
  return {
    ...proj, client_name: nm.get(proj.client_id) || 'Client', provider_name: proj.provider_id ? nm.get(proj.provider_id) || 'Developer' : '',
    milestones: ((m.data ?? []) as Milestone[]).map(x => ({ ...x, amount: Number(x.amount || 0) })),
    changes: ((c.data ?? []) as Change[]).map(x => ({ ...x, cost_delta: Number(x.cost_delta || 0) })),
    messages: (msg.data ?? []) as Message[],
  };
}

export function defaultOnboarding(kind: DevKind): OnboardingItem[] {
  const common: OnboardingItem[] = [
    { label: 'Share your logo, brand colours and photos', done: false, who: 'client' },
    { label: 'Agree how you will talk (WhatsApp group, weekly call)', done: false, who: 'provider' },
    { label: 'Name one person who approves the work', done: false, who: 'client' },
  ];
  const byKind: Record<DevKind, OnboardingItem[]> = {
    website: [
      { label: 'Domain name and hosting access (or let the developer buy them in your name)', done: false, who: 'client' },
      { label: 'Page text, prices and contact details', done: false, who: 'client' },
      { label: 'Set up a test (staging) link for you to review', done: false, who: 'provider' },
    ],
    mobile_app: [
      { label: 'Google Play and Apple developer accounts in the business name', done: false, who: 'client' },
      { label: 'Screens and user journeys agreed', done: false, who: 'provider' },
      { label: 'Share a test build you can install', done: false, who: 'provider' },
    ],
    automation: [
      { label: 'List the tools to connect and who has the logins', done: false, who: 'client' },
      { label: 'Map the current steps that will be automated', done: false, who: 'provider' },
      { label: 'Run it on test data before going live', done: false, who: 'provider' },
    ],
    other: [
      { label: 'Share examples of what you want', done: false, who: 'client' },
      { label: 'Confirm what access the developer needs', done: false, who: 'provider' },
    ],
  };
  return [...common, ...byKind[kind]];
}

export async function createProject(p: { title: string; kind: DevKind; requirements: Requirements; currency?: string; request_id?: string | null }): Promise<string> {
  const title = clean(p.title, 120);
  if (title.length < 3) throw new Error('Give the project a short name, e.g. "Booking website"');
  const { data, error } = await supabase.from('dev_projects').insert({
    title, kind: p.kind, requirements: tidyReq(p.requirements), currency: (p.currency || 'NGN').toUpperCase().slice(0, 3),
    request_id: p.request_id ?? null, onboarding: defaultOnboarding(p.kind), maintenance: blankMaintenance(),
  }).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

export function tidyReq(r: Requirements): Requirements {
  const list = (a: string[]) => a.map(s => clean(s, 200)).filter(Boolean).slice(0, 30);
  return {
    goal: clean(r.goal, 1000), users: clean(r.users, 500), features: list(r.features), integrations: list(r.integrations), platforms: clean(r.platforms, 200),
    content: clean(r.content, 500), existing: clean(r.existing, 500), budget: clean(r.budget, 80), deadline: clean(r.deadline, 80), notes: clean(r.notes, 1500),
  };
}

export type ProjectPatch = Partial<Pick<DevProject, 'title' | 'kind' | 'requirements' | 'docs' | 'currency' | 'total_amount' | 'payment_terms' | 'status' | 'onboarding' | 'maintenance' | 'request_id'>>;
export async function updateProject(id: string, patch: ProjectPatch) {
  const row: Record<string, unknown> = { ...patch };
  if (patch.requirements) row.requirements = tidyReq(patch.requirements);
  if (patch.title !== undefined) { row.title = clean(patch.title, 120); if ((row.title as string).length < 3) throw new Error('Give the project a short name'); }
  if (patch.payment_terms !== undefined) row.payment_terms = clean(patch.payment_terms, 2000);
  if (patch.total_amount !== undefined) { const n = Number(patch.total_amount); if (!Number.isFinite(n) || n < 0) throw new Error('Enter the total as a number'); row.total_amount = Math.round(n * 100) / 100; }
  const { error } = await supabase.from('dev_projects').update(row).eq('id', id);
  fail(error);
}
export async function saveDoc(p: DevProject, key: DocKey, text: string) {
  const prev = p.docs[key];
  await updateProject(p.id, { docs: { ...p.docs, [key]: { text: text.slice(0, 20000), at: new Date().toISOString(), version: (prev?.version ?? 0) + 1 } } });
}
export async function deleteProject(id: string) { const { error } = await supabase.from('dev_projects').delete().eq('id', id); fail(error); }

/** Before agreement: replace the milestone list. After agreement milestones change only through a change request. */
export type MilestoneDraft = { id?: string; title: string; description: string; amount: number | string; due_date: string };
export async function saveMilestones(projectId: string, list: MilestoneDraft[], existing: Milestone[]) {
  const rows = list.map((m, i) => ({ id: m.id, title: clean(m.title, 160), description: clean(m.description, 2000), amount: Math.max(0, Math.round(Number(m.amount || 0) * 100) / 100), due_date: m.due_date || null, position: i + 1 }))
    .filter(m => m.title.length >= 2);
  const keep = new Set(rows.map(r => r.id).filter(Boolean));
  const drop = existing.filter(e => !keep.has(e.id)).map(e => e.id);
  if (drop.length) { const { error } = await supabase.from('dev_milestones').delete().in('id', drop); fail(error); }
  for (const r of rows) {
    const { id, ...v } = r;
    const before = existing.find(e => e.id === id);
    if (id && before && before.title === v.title && before.description === v.description && before.amount === v.amount && (before.due_date || null) === v.due_date && before.position === v.position) continue;
    const { error } = id ? await supabase.from('dev_milestones').update(v).eq('id', id) : await supabase.from('dev_milestones').insert({ ...v, project_id: projectId });
    fail(error);
  }
}
export async function setMilestoneStatus(id: string, status: Milestone['status']) { const { error } = await supabase.from('dev_milestones').update({ status }).eq('id', id); fail(error); }

export async function setProvider(projectId: string, providerId: string | null) { const { error } = await supabase.rpc('dev_set_provider', { p_project: projectId, p_provider: providerId }); fail(error); }
export async function acceptTerms(projectId: string): Promise<'accepted' | 'agreed' | 'already agreed'> {
  const { data, error } = await supabase.rpc('dev_accept_terms', { p_project: projectId }); fail(error); return data as 'accepted' | 'agreed';
}

export async function proposeChange(projectId: string, c: { title: string; description: string; cost_delta: number | string; days_delta: number | string }) {
  const title = clean(c.title, 160);
  if (title.length < 3) throw new Error('Say what should change, e.g. "Add a payments page"');
  const { error } = await supabase.from('dev_changes').insert({ project_id: projectId, title, description: clean(c.description, 3000), cost_delta: Math.round(Number(c.cost_delta || 0) * 100) / 100, days_delta: Math.round(Number(c.days_delta || 0)) });
  fail(error);
}
export async function decideChange(id: string, approve: boolean) { const { error } = await supabase.rpc('dev_decide_change', { p_change: id, p_approve: approve }); fail(error); }
export async function withdrawChange(id: string) { const { error } = await supabase.rpc('dev_withdraw_change', { p_change: id }); fail(error); }

export async function postMessage(me: string, projectId: string, m: { kind: 'message' | 'update' | 'deliverable'; body: string; link?: string; milestone_id?: string | null }) {
  const body = clean(m.body, 4000), link = clean(m.link, 500);
  if (!body && !link) throw new Error('Write a message first');
  const { error } = await supabase.from('dev_messages').insert({
    project_id: projectId, sender: me, kind: m.kind, body, link: link && !/^https?:\/\//i.test(link) ? `https://${link}` : link,
    milestone_id: m.milestone_id || null, status: m.kind === 'deliverable' ? 'submitted' : null,
  });
  fail(error);
}
export async function reviewDeliverable(id: string, status: 'accepted' | 'changes_requested') { const { error } = await supabase.from('dev_messages').update({ status }).eq('id', id); fail(error); }

/** Developers and partners you can add: people you have an accepted introduction with (2.12). */
export type PartnerOption = { user_id: string; display_name: string; industry?: string };
export async function partnerOptions(): Promise<PartnerOption[]> {
  const { data: r, error } = await supabase.functions.invoke('nexora-network', { body: { action: 'connections' } });
  if (error) throw new Error("Couldn't load your introductions.");
  const seen = new Set<string>();
  return ((r?.connections ?? []) as { status: string; other: PartnerOption }[]).filter(c => c.status === 'accepted' && c.other?.user_id && !seen.has(c.other.user_id) && seen.add(c.other.user_id)).map(c => c.other);
}

/** Your own posted project requests (2.12), to link or to start from. */
export async function myRequests(me: string): Promise<{ id: string; title: string; description: string; requirements: string[]; budget: string; timeline: string; category: string }[]> {
  const { data } = await supabase.from('network_requests').select('id,title,description,requirements,budget,timeline,category').eq('user_id', me).order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as { id: string; title: string; description: string; requirements: string[]; budget: string; timeline: string; category: string }[];
}
/** Post the project to Partners and services → Projects so developers can reply, and link it here. */
export async function postAsRequest(p: DevProject): Promise<string> {
  const r = p.requirements;
  const { data, error } = await supabase.from('network_requests').insert({
    title: p.title.slice(0, 120), category: p.kind === 'automation' ? 'Software and automation' : 'Websites and apps', kind_needed: 'developer',
    description: [r.goal, r.users ? `For: ${r.users}` : ''].filter(Boolean).join('\n').slice(0, 4000) || p.title,
    requirements: [...r.features, ...r.integrations.map(i => `Works with ${i}`)].slice(0, 20).map(s => s.slice(0, 200)),
    budget: r.budget.slice(0, 80), timeline: r.deadline.slice(0, 80), remote_ok: true,
  }).select('id').single();
  fail(error);
  const id = (data as { id: string }).id;
  await updateProject(p.id, { request_id: id });
  return id;
}

// ---------- Numbers ----------
export const sumMilestones = (m: { amount: number | string }[]) => Math.round(m.reduce((s, x) => s + Number(x.amount || 0), 0) * 100) / 100;
export function progress(m: Milestone[]): { done: number; total: number; paid: number; paidAmount: number } {
  return { done: m.filter(x => x.status === 'approved' || x.status === 'paid').length, total: m.length, paid: m.filter(x => x.status === 'paid').length, paidAmount: sumMilestones(m.filter(x => x.status === 'paid')) };
}
/** What still stops both sides from accepting the terms (same checks as the database). */
export function termsGaps(p: DevProject, m: { amount: number | string }[]): string[] {
  const g: string[] = [];
  if (!p.provider_id) g.push('Add the developer or service partner');
  if (!p.docs.scope?.text?.trim()) g.push('Write the scope of work');
  if (!m.length) g.push('Add at least one milestone');
  if (!(p.total_amount > 0)) g.push('Set the project total');
  else if (m.length && sumMilestones(m) !== p.total_amount) g.push(`Milestones add up to ${sumMilestones(m).toLocaleString()} but the total is ${p.total_amount.toLocaleString()}`);
  if (!p.payment_terms.trim()) g.push('Write the payment terms');
  return g;
}

// ---------- AI (same route as Brain; nothing is shared until you save) ----------
async function ask(prompt: string): Promise<string> {
  const { data: j, error } = await supabase.functions.invoke('nexora-agent', { body: { mode: 'assistant', message: prompt, history: [] } });
  if (error || !j?.success) throw new Error(j?.message || 'Nexora could not write this right now. Please try again.');
  return String(j.reply || '').trim();
}
const reqText = (p: Pick<DevProject, 'title' | 'kind' | 'requirements' | 'currency'>) => {
  const r = p.requirements;
  return [`Project: ${p.title} (${devKindLabel(p.kind)})`, r.goal && `Goal: ${r.goal}`, r.users && `Who will use it: ${r.users}`,
    r.features.length && `Must-have features: ${r.features.join('; ')}`, r.integrations.length && `Must work with: ${r.integrations.join('; ')}`,
    r.platforms && `Platforms: ${r.platforms}`, r.content && `Content and branding: ${r.content}`, r.existing && `What exists today: ${r.existing}`,
    r.budget && `Budget: ${r.budget} (${p.currency})`, r.deadline && `Deadline: ${r.deadline}`, r.notes && `Notes: ${r.notes}`].filter(Boolean).join('\n');
};

/** "I need a booking website for my salon" → structured requirements the client can edit. */
export async function suggestRequirements(idea: string, kind: DevKind, business: string): Promise<{ title: string; requirements: Requirements }> {
  const reply = await ask(`A small business (${business || 'a small business'}) wants a ${devKindLabel(kind).toLowerCase()} built. Turn their words into clear project requirements.
Reply with ONE JSON object only, no other text: {"title": string (max 60 chars), "goal": string (1-2 sentences), "users": string (who will use it), "features": string[] (5-10 short, specific, testable must-haves), "integrations": string[] (payment, WhatsApp, email, Google Sheets etc., only if relevant), "platforms": string (e.g. "Web, works on phones" or "Android and iPhone"), "content": string (what content/branding is needed), "budget": string (only if they said, else ""), "deadline": string (only if they said, else "")}.
Do not invent facts about the business. Their words: """${idea.slice(0, 1500)}"""`);
  const m = reply.match(/\{[\s\S]*\}/);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI reply
  let o: any = null; try { o = m ? JSON.parse(m[0]) : null; } catch { o = null; }
  if (!o) throw new Error('Nexora could not read that. Try describing it in a little more detail.');
  const arr = (a: unknown) => (Array.isArray(a) ? a : []).map(s => clean(s, 200)).filter(Boolean);
  return { title: clean(o.title, 120), requirements: tidyReq({ ...blankRequirements(), goal: clean(o.goal, 1000), users: clean(o.users, 500), features: arr(o.features), integrations: arr(o.integrations), platforms: clean(o.platforms, 200), content: clean(o.content, 500), budget: clean(o.budget, 80), deadline: clean(o.deadline, 80) }) };
}

const DOC_PROMPT: Record<DocKey, string> = {
  brief: 'Write a one-page PROJECT BRIEF with these headings: Overview, Goals, Who it is for, What success looks like, Must-haves, Nice-to-haves, Budget and timeline, Open questions.',
  scope: 'Write a SCOPE OF WORK both sides can sign. Headings: Summary, In scope (numbered list of deliverables), Out of scope, Assumptions, Client responsibilities, Acceptance (how each deliverable is checked and approved), Handover (code, logins, documentation, training), Change control (any change after agreement goes through a written change request with its cost and time, approved by both sides before work).',
  tech: 'Write TECHNICAL REQUIREMENTS. Headings: Pages or screens, Features (each with a short acceptance check), Integrations, Data and accounts, Hosting and domain, Security and privacy (logins, backups, data protection), Performance and devices, Testing, Launch checklist. Recommend common, affordable technology and say why in one line each.',
  proposal: 'Write a PROPOSAL from the developer to the client. Headings: Understanding of your needs, Proposed solution, How we will work (communication, reviews, change requests), Timeline, Investment (use the budget if given, split by milestone; say figures are estimates to confirm), Payment terms (e.g. a deposit then payment on each approved milestone), Maintenance and support after launch, Next steps.',
  plan: 'Write a MILESTONE PLAN as a short intro then a numbered list of 3-6 milestones. For each: name, what is delivered, how the client approves it, estimated weeks, share of the total price in percent (all shares add up to 100).',
};
export async function writeDoc(p: ProjectFull, key: DocKey, business: string): Promise<string> {
  const ms = p.milestones.length ? `\nAgreed or drafted milestones: ${p.milestones.map(m => `${m.title} (${m.amount} ${p.currency}${m.due_date ? `, due ${m.due_date}` : ''})`).join('; ')}` : '';
  const total = p.total_amount ? `\nProject total: ${p.total_amount} ${p.currency}` : '';
  const terms = p.payment_terms ? `\nPayment terms: ${p.payment_terms}` : '';
  const brief = key !== 'brief' && p.docs.brief?.text ? `\nProject brief already written:\n${p.docs.brief.text.slice(0, 3000)}` : '';
  const text = await ask(`You help a small business (${business || 'a small business'}) and a software developer plan a digital project. ${DOC_PROMPT[key]}
Use markdown headings (##) and short bullet points. Plain, friendly English a business owner understands. Use only the facts below; where something is unknown write "To confirm" instead of inventing it. No preamble, start with the first heading.
${reqText(p)}${total}${terms}${ms}${brief}`);
  if (!text) throw new Error('Nexora could not write this right now. Please try again.');
  return text.slice(0, 20000);
}

/** A milestone plan with amounts that add up exactly to the total (or to the budget if there is no total yet). */
export async function suggestMilestones(p: ProjectFull, total: number): Promise<MilestoneDraft[]> {
  const reply = await ask(`Split this digital project into 3-6 milestones for a written agreement between a small business and a developer.
Reply with ONE JSON array only, no other text: [{"title": string (max 60 chars), "description": string (what is delivered and how the client checks it, max 200 chars), "percent": number (share of the price; all add up to 100), "weeks": number (weeks from the start until this is due)}]. The last milestone is launch and handover.
${reqText(p)}`);
  const m = reply.match(/\[[\s\S]*\]/);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI reply
  let a: any[] = []; try { a = m ? JSON.parse(m[0]) : []; } catch { a = []; }
  a = a.filter(x => x && typeof x.title === 'string').slice(0, 8);
  if (!a.length) throw new Error('Nexora could not plan the milestones. Please try again.');
  const pct = a.map(x => Math.max(0, Number(x.percent) || 0));
  const shares = pct.some(Boolean) ? pct : a.map(() => 1);
  const sum = shares.reduce((s, x) => s + x, 0);
  const amounts = shares.map(x => Math.floor((x / sum) * total));
  amounts[amounts.length - 1] += Math.round((total - amounts.reduce((s, x) => s + x, 0)) * 100) / 100; // exact total
  const start = Date.now();
  return a.map((x, i) => ({
    title: clean(x.title, 160), description: clean(x.description, 2000), amount: total ? amounts[i] : 0,
    due_date: Number(x.weeks) > 0 ? new Date(start + Number(x.weeks) * 7 * 86400000).toISOString().slice(0, 10) : '',
  }));
}

/** For the developer: a short, clear progress update for the client from the milestone status. */
export async function draftUpdate(p: ProjectFull): Promise<string> {
  return (await ask(`Write a short progress update (4-7 lines, friendly, no greeting line, no sign-off) from a developer to their client about this project. Say what is done, what is next, and anything needed from the client. Facts only:
Project: ${p.title}
Milestones: ${p.milestones.map(m => `${m.title}: ${MILESTONE_LABEL[m.status]}${m.due_date ? ` (due ${m.due_date})` : ''}`).join('; ') || 'none yet'}
Onboarding still open: ${p.onboarding.filter(o => !o.done).map(o => `${o.label} (${o.who})`).join('; ') || 'nothing'}
Pending change requests: ${p.changes.filter(c => c.status === 'proposed').map(c => c.title).join('; ') || 'none'}`)).slice(0, 4000);
}

/** The written agreement as plain text (to print, save as PDF or send). */
export function agreementText(p: ProjectFull): string {
  const money = (n: number) => `${p.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const when = (s: string | null) => (s ? new Date(s).toLocaleString() : 'not yet');
  return [
    `DIGITAL PROJECT AGREEMENT — ${p.title}`,
    `Client: ${p.client_name}    Developer / service partner: ${p.provider_name || 'not chosen yet'}`,
    `Type: ${devKindLabel(p.kind)}    Scope version: ${p.scope_version}`,
    '', 'SCOPE OF WORK', p.docs.scope?.text || '(not written yet)',
    '', 'MILESTONES', ...p.milestones.map((m, i) => `${i + 1}. ${m.title} — ${money(m.amount)}${m.due_date ? ` — due ${m.due_date}` : ''}${m.description ? `\n   ${m.description}` : ''}`),
    `Total: ${money(p.total_amount)}`,
    '', 'PAYMENT TERMS', p.payment_terms || '(not written yet)',
    '', 'CHANGE CONTROL', 'After both sides accept, any change to the scope, milestones, price or dates is made through a written change request in Nexora that states the cost and time impact. Work on a change starts only after the other side approves it.',
    ...(p.changes.filter(c => c.status === 'approved').length ? ['', 'APPROVED CHANGES', ...p.changes.filter(c => c.status === 'approved').map(c => `- ${c.title}: ${c.cost_delta ? money(c.cost_delta) : 'no cost change'}${c.days_delta ? `, ${c.days_delta} days` : ''}`)] : []),
    '', 'ACCEPTANCE', `Client accepted: ${when(p.client_accepted_at)}`, `Developer accepted: ${when(p.provider_accepted_at)}`, `Agreed: ${when(p.agreed_at)}`,
    '', 'Nexora records this agreement and introduces the two businesses; it is not a party to the agreement and does not hold payments.',
  ].join('\n');
}
