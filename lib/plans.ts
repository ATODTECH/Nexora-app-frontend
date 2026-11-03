import { supabase } from './supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const clientNow = () => {
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* keep UTC */ }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), tz, tz_offset_min: -d.getTimezoneOffset() };
};
/** Same route as Brain: the agent (knowledge base, goals, orders), then the plain ai-chat function if the agent is down. */
async function askNexora(text: string): Promise<{ text: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` };
  const post = async (fn: string, body: unknown, ms: number) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      return { ok: res.ok, json: (await res.json().catch(() => ({}))) as any };
    } finally { clearTimeout(t); }
  };
  try {
    const r = await post('nexora-agent', { mode: 'assistant', long: true, message: text, history: [], client_now: clientNow() }, 90000);
    if (r.ok && r.json.success && r.json.reply) return { text: String(r.json.reply) };
    if (r.json?.code === 'subscription' || r.json?.code === 'quota') return { text: `${r.json.message || 'Your Nexora plan needs attention.'}\n\nOpen Profile, then Plans & billing.` };
  } catch { /* fall back below */ }
  const r = await post('ai-chat', { message: text }, 45000);
  if (!r.ok || !r.json.success) throw new Error(r.json?.message || 'Nexora could not answer that.');
  return { text: String(r.json.reply || '') };
}

// Business Idea Development and Planning (blueprint 2.2). One plan takes an idea through five steps:
// the idea, the concept, the plans, the offer and launch, then learning and updating from customers and results.
// Every part is drafted by Nexora (with the business's own knowledge and globally proven methods), and can be edited by hand.
// The website has the same steps and prompts in src/lib/plans.ts.

export type PlanKind = 'new' | 'existing';
export type PlanPart = { text: string; updated_at: string; by: 'ai' | 'you' | 'update' };
export type Learning = { id: string; at: string; kind: 'customer' | 'result' | 'other'; text: string };
export type PlanVersion = { at: string; key: string; text: string; why: string };
export type Plan = {
  id: string; title: string; idea: string; kind: PlanKind;
  sections: Record<string, PlanPart>; learnings: Learning[]; history: PlanVersion[];
  created_at: string; updated_at: string;
};
export type PartDef = { key: string; label: string; sub: string; method: string; ask: string };
export type StepDef = { key: string; n: number; title: string; sub: string; parts: PartDef[] };

export const PLAN_STEPS: StepDef[] = [
  { key: 'idea', n: 1, title: 'Shape the idea', sub: 'From an early idea to a clear business concept', parts: [
    { key: 'concept', label: 'Business concept', sub: 'The idea as a one-page concept', method: 'Lean Canvas',
      ask: 'a one-page business concept using the Lean Canvas: the problem, the customers, the unique value, the solution, channels, revenue, main costs, key numbers to track and an unfair advantage. End with the 3 biggest assumptions that must be true for this to work' },
  ] },
  { key: 'concept', n: 2, title: 'Customers and market', sub: 'Who it is for, their problems, why you, and how it makes money', parts: [
    { key: 'segments', label: 'Customer segments', sub: 'The groups of customers to serve first', method: 'customer segmentation and personas',
      ask: '3–4 customer segments, each with who they are, where to find them, what they buy now, and how big an opportunity they are (high, medium or low). Recommend which segment to start with and why, and give a short persona for it' },
    { key: 'problems', label: 'Customer problems', sub: 'The problems and needs the business solves', method: 'jobs-to-be-done',
      ask: 'the main customer problems as jobs to be done: for each, the job, the pain today, how often it happens and how much it matters. Rank them, and list 5 questions to ask real customers to confirm them' },
    { key: 'value', label: 'Value propositions', sub: 'Why customers would choose you', method: 'the value proposition canvas',
      ask: 'value propositions for the main segment using the value proposition canvas: pains relieved, gains created and the products that do it. Finish with a one-sentence value proposition and 3 short taglines' },
    { key: 'competitors', label: 'Competitors to research', sub: 'Who else customers could choose, and what to find out', method: 'competitor analysis',
      ask: 'the competitors to research: direct competitors, indirect ones and what customers do instead today. Only name real businesses you are sure exist, and mark every fact about them "to check". For each, say what to find out (prices, offer, reviews, channels). End with a simple research checklist' },
    { key: 'revenue', label: 'Revenue models', sub: 'The ways the business can make money', method: 'revenue model options',
      ask: '3–5 possible revenue models (for example one-off sales, subscriptions, bundles, services, commission), each with how it works, pros, cons and fit. Recommend one to start with and explain why' },
  ] },
  { key: 'plans', n: 3, title: 'Plans', sub: 'Business, marketing and sales plans, budget, goals and checklists', parts: [
    { key: 'business_plan', label: 'Business plan', sub: 'The full plan in the standard format', method: 'the standard business plan format',
      ask: 'a business plan with: executive summary, the business, the market and customers, products and pricing, marketing and sales, operations, the team, the money (start-up costs, monthly costs, break-even), risks and the next 90 days' },
    { key: 'marketing_plan', label: 'Marketing plan', sub: 'How customers will hear about and want the offer', method: 'the 4Ps and the AIDA funnel',
      ask: 'a 90-day marketing plan: the target customer, the message, the 4Ps, the channels with what to post or do on each, a simple weekly content rhythm, a budget split and the numbers to track' },
    { key: 'sales_plan', label: 'Sales plan', sub: 'How interest becomes paying customers', method: 'a sales pipeline',
      ask: 'a sales plan: monthly sales targets, the sales pipeline stages from first contact to repeat customer, what to do at each stage, a short sales script, how to follow up and how to handle the 3 most common objections' },
    { key: 'budget', label: 'Budget', sub: 'Start-up costs, monthly costs and break-even', method: 'a start-up and operating budget with a break-even calculation',
      ask: 'a budget in tables: start-up costs, monthly running costs and expected monthly income, then the break-even point with the calculation shown. Use my real prices and costs where you know them; otherwise write [add: amount], or a clearly marked estimate to check' },
    { key: 'goals', label: 'Goals and milestones', sub: 'What success looks like, with dates', method: 'SMART goals and milestones',
      ask: '3–5 SMART goals and a milestone table for the next 6 months (milestone, target date, how we know it is done, owner). Dates must start from today' },
    { key: 'checklist', label: 'Operating checklist', sub: 'The routine that keeps the business running', method: 'standard operating checklists',
      ask: 'an operating checklist with tick boxes, grouped into daily, weekly and monthly tasks, covering sales, orders and delivery, customers, stock, money and marketing' },
  ] },
  { key: 'launch', n: 4, title: 'Offer and launch', sub: 'Products and services, pricing, launch activities and growth experiments', parts: [
    { key: 'offer', label: 'Products and services', sub: 'Exactly what will be sold', method: 'an offer definition',
      ask: 'the products and services to offer: for each, what it is, who it is for, what is included, the main benefit, and whether it is the starter offer, the main offer or an add-on' },
    { key: 'pricing', label: 'Pricing assumptions', sub: 'Prices, the thinking behind them, and what to test', method: 'cost-plus, competitor-based and value-based pricing',
      ask: 'pricing assumptions: for each product or service, a suggested price with the cost-plus, competitor and value view shown side by side, the margin, and the assumptions behind it. End with how to test the prices with real customers' },
    { key: 'launch_plan', label: 'Launch activities', sub: 'What to do before, during and after launch', method: 'a phased launch plan',
      ask: 'launch activities as a timeline: 4 weeks before, launch week and 4 weeks after, each task with an owner, a date and the result it should bring. Include a launch-day checklist' },
    { key: 'experiments', label: 'Growth experiments', sub: 'Small tests to find what grows the business', method: 'ICE-scored growth experiments',
      ask: '6 growth experiments in a table: the idea, the hypothesis, the number to watch, what result counts as success, how long to run it, and an ICE score (impact, confidence, ease, each out of 10). Sort them by score' },
  ] },
];
export const ALL_PARTS: PartDef[] = PLAN_STEPS.flatMap(s => s.parts);
export const partDef = (key: string) => ALL_PARTS.find(p => p.key === key);
/** Parts that usually change when the business learns something (pre-ticked in "Update my plan"). */
export const UPDATE_DEFAULT = ['value', 'pricing', 'marketing_plan', 'sales_plan', 'goals', 'experiments'];
export const LEARNING_KIND: Record<Learning['kind'], string> = { customer: 'From customers', result: 'From results', other: 'Other' };

const RULE = 'Use what you know about my business from my knowledge base, and follow the globally proven method named. Do not invent facts, prices, numbers, names, testimonials or guarantees; where something is missing write [add: ...] so I can fill it in, and mark estimates clearly. Use clear headings, short tables where they help (one short line per cell), and plain words. Write Markdown only, never HTML tags such as <br>. When you mention my goals, sales or other figures, quote them exactly as given to you; do not work out new targets. Only write the text: do not take any actions or change anything in my account. Start directly with the content, with no greeting.';
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function about(p: Plan) {
  const who = p.kind === 'existing' ? 'a plan to grow my existing business' : 'a new business idea (not my current business, so only use my business data where it clearly applies)';
  // Short extracts of the parts already written (kept under ~6,000 characters so the request stays within limits).
  const done = ALL_PARTS.filter(d => p.sections[d.key]?.text).map(d => `### ${d.label}\n${clip(p.sections[d.key].text, 450)}`);
  let ctx = done.join('\n\n');
  if (ctx.length > 6000) ctx = `${ctx.slice(0, 6000)}…`;
  return `I am working on ${who}, called "${p.title}". Today is ${today()}.\nThe idea: ${clip(p.idea || p.title, 1500)}\n${ctx ? `\nWhat we have worked out so far (short extracts):\n${ctx}\n` : ''}`;
}
/** The request Nexora gets for one part of the plan. */
export function draftPrompt(p: Plan, key: string) {
  const d = partDef(key)!;
  return `Write the ${d.label.toLowerCase()} for the ${p.kind === 'existing' ? 'plan' : 'business idea'} below, using ${d.method}: ${d.ask}. Keep it practical and about 300–550 words. ${RULE}\n\n${about(p)}`;
}

type OrderRow = { created_at: string; status: string; payment_status?: string; total: number | null; refunded_amount?: number | null; currency?: string | null; items?: string | null; line_items?: { name?: string; qty?: number }[] | null };
export type Snapshot = { currency: string; orders: number; sales: number; paid: number; prevOrders: number; prevSales: number; top: { name: string; qty: number }[] } | null;
/** The business's real results for the last 30 days against the 30 before (worked out here, so Nexora quotes them instead of recalculating). */
export async function loadSnapshot(): Promise<Snapshot> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data } = await supabase.from('orders').select('created_at,status,payment_status,total,refunded_amount,currency,items,line_items').gte('created_at', since).limit(2000);
  const rows = ((data ?? []) as OrderRow[]).filter(o => o.status !== 'cancelled');
  if (!rows.length) return null;
  const cut = Date.now() - 30 * 86400000;
  const cur = rows.filter((o: OrderRow) => new Date(o.created_at).getTime() >= cut);
  const prev = rows.filter((o: OrderRow) => new Date(o.created_at).getTime() < cut);
  const net = (o: OrderRow) => Math.max(0, Number(o.total || 0) - Number(o.refunded_amount || 0));
  const sum = (l: OrderRow[]) => Math.round(l.reduce((n, o) => n + net(o), 0) * 100) / 100;
  const counts: Record<string, number> = {};
  for (const o of cur) {
    const lines = Array.isArray(o.line_items) && o.line_items.length ? o.line_items : o.items ? [{ name: o.items.slice(0, 60), qty: 1 }] : [];
    for (const l of lines) if (l?.name) counts[l.name] = (counts[l.name] || 0) + (Number(l.qty) || 1);
  }
  const curr: Record<string, number> = {};
  for (const o of rows) curr[o.currency || 'NGN'] = (curr[o.currency || 'NGN'] || 0) + 1;
  return {
    currency: Object.entries(curr).sort((a, b) => b[1] - a[1])[0][0],
    orders: cur.length, sales: sum(cur), paid: sum(cur.filter((o: OrderRow) => o.payment_status === 'paid')),
    prevOrders: prev.length, prevSales: sum(prev),
    top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => ({ name, qty })),
  };
}
const fmt = (n: number, c: string) => `${c} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export function snapshotText(s: Snapshot) {
  if (!s) return 'No orders recorded in the last 60 days.';
  const ch = s.prevSales ? `${s.sales >= s.prevSales ? 'up' : 'down'} ${Math.abs(Math.round(((s.sales - s.prevSales) / s.prevSales) * 100))}% on the 30 days before` : 'no sales in the 30 days before';
  return `Last 30 days: ${s.orders} orders, sales ${fmt(s.sales, s.currency)} (${ch}), of which ${fmt(s.paid, s.currency)} paid. The 30 days before: ${s.prevOrders} orders, sales ${fmt(s.prevSales, s.currency)}.${s.top.length ? ` Best sellers: ${s.top.map(t => `${t.name} (${t.qty})`).join(', ')}.` : ''}`;
}
/** The request Nexora gets to update one part from what was learned and the latest results. */
export function updatePrompt(p: Plan, key: string, snap: Snapshot) {
  const d = partDef(key)!;
  const learn = p.learnings.slice(-15).map(l => `- ${new Date(l.at).toLocaleDateString()} (${LEARNING_KIND[l.kind]}): ${l.text}`).join('\n');
  return `Update the ${d.label.toLowerCase()} of the plan below using what the business has learned. Start with a short "What changed" list (2–4 points, each saying what you changed and which lesson or result caused it), then give the full updated ${d.label.toLowerCase()} using ${d.method}. Keep what still holds. About 300–550 words. ${RULE}\n\n${about(p)}\nThe current ${d.label.toLowerCase()}:\n${clip(p.sections[key]?.text || '(not written yet)', 3000)}\n\nWhat we have learned from customers and results:\n${learn || '- (nothing written down yet)'}\n\nThe latest results (already calculated: quote them exactly, do not recalculate): ${snapshotText(snap)}`;
}

// ---- Saving ----
const COLS = 'id,title,idea,kind,sections,learnings,history,created_at,updated_at';
const norm = (r: any): Plan => ({ ...r, sections: r.sections && typeof r.sections === 'object' ? r.sections : {}, learnings: Array.isArray(r.learnings) ? r.learnings : [], history: Array.isArray(r.history) ? r.history : [] });
export async function loadPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('business_plans').select(COLS).order('updated_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(norm);
}
export async function loadPlan(id: string): Promise<Plan | null> {
  const { data, error } = await supabase.from('business_plans').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? norm(data) : null;
}
export async function createPlan(f: { title: string; idea: string; kind: PlanKind }): Promise<Plan> {
  const title = f.title.trim() || f.idea.trim().split(/[.\n]/)[0].slice(0, 80) || 'My business idea';
  if (!f.idea.trim()) throw new Error('Describe your idea in a sentence or two');
  const { data, error } = await supabase.from('business_plans').insert({ title: title.slice(0, 120), idea: f.idea.trim().slice(0, 4000), kind: f.kind }).select(COLS).single();
  if (error) throw new Error(error.message);
  return norm(data);
}
export async function patchPlan(id: string, patch: Partial<Pick<Plan, 'title' | 'idea' | 'kind' | 'sections' | 'learnings' | 'history'>>): Promise<Plan> {
  const { data, error } = await supabase.from('business_plans').update(patch).eq('id', id).select(COLS).single();
  if (error) throw new Error(error.message);
  return norm(data);
}
export async function deletePlan(id: string) {
  const { error } = await supabase.from('business_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
/** Sets one part's text, keeping the earlier version in the history (last 40 kept). */
export function withPart(p: Plan, key: string, text: string, by: PlanPart['by'], why: string): Pick<Plan, 'sections' | 'history'> {
  const old = p.sections[key];
  const history = old?.text && old.text !== text ? [...p.history, { at: old.updated_at, key, text: old.text, why }].slice(-40) : p.history;
  return { sections: { ...p.sections, [key]: { text, updated_at: new Date().toISOString(), by } }, history };
}
export const newLearningId = () => Math.random().toString(36).slice(2, 10);

/** Asks Nexora for one part (the same agent as Brain, so it reads the business's knowledge). */
export async function writePart(prompt: string) {
  let text = '';
  try { text = (await askNexora(prompt)).text.trim(); } catch { text = ''; }
  text = text.replace(/<br\s*\/?>/gi, ' ').replace(/<\/?(p|div|span)[^>]*>/gi, '').trim();
  if (/Open Profile, then Plans & billing/.test(text)) throw new Error(text.split('\n')[0]);
  if (!text || /all available ai services failed/i.test(text)) throw new Error('Nexora’s AI is busy right now. Please try again in a few minutes.');
  return text;
}

/** How far the plan has got: parts written out of all parts. */
export const progress = (p: Plan) => ({ done: ALL_PARTS.filter(d => p.sections[d.key]?.text).length, total: ALL_PARTS.length });
/** The whole plan as one Markdown document (for copying, saving and downloading). */
export function planMarkdown(p: Plan) {
  const out = [`# ${p.title}`, '', `**The idea:** ${p.idea}`, ''];
  for (const s of PLAN_STEPS) {
    const parts = s.parts.filter(d => p.sections[d.key]?.text);
    if (!parts.length) continue;
    out.push(`## ${s.n}. ${s.title}`, '');
    for (const d of parts) out.push(`### ${d.label}`, '', p.sections[d.key].text, '');
  }
  if (p.learnings.length) out.push('## What we have learned', '', ...p.learnings.map(l => `- ${new Date(l.at).toLocaleDateString()} · ${LEARNING_KIND[l.kind]}: ${l.text}`), '');
  return out.join('\n');
}
