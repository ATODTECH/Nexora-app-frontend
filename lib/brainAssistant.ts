// AI Business Brain and Assistant (blueprint 2.1): what the overview screen offers. Same lists as the website's
// src/lib/chat.ts (BRAIN_CAPABILITIES, workflows, reusable prompts kept in ai_saved_items as kind 'prompt').
import { supabase } from './supabase';

/** A starter: a question sent straight to Brain (`ask`; ending in ": " means you finish it first), or an AI tool (`tool`). */
export type BrainAction = { label: string; ask?: string; tool?: string };
export type BrainCapability = { key: string; title: string; sub: string; icon: string; actions: BrainAction[] };

export const BRAIN_CAPABILITIES: BrainCapability[] = [
  { key: 'ask', icon: 'chatbubbles-outline', title: 'Ask, research and solve', sub: 'Answers about your business, research, planning, writing, analysis and problem-solving.', actions: [
    { label: 'Analyse my sales', ask: 'Analyse my sales for the last 30 days: what is growing, what is falling, my best products and customers, and 3 things I should do next.' },
    { label: 'Research a topic', ask: 'Research this for my business and give me the key facts with sources, then what it means for me: ' },
    { label: 'Plan my week', ask: 'Plan my week: look at my orders to ship, unpaid orders, follow-ups, schedule and low stock, and give me a day-by-day list.' },
    { label: 'Solve a problem', ask: 'Help me solve this business problem step by step. Ask me anything you need to know first: ' },
    { label: 'Write something', ask: 'Write this for my business: ' },
  ] },
  { key: 'documents', icon: 'document-text-outline', title: 'Ideas, strategies and documents', sub: 'Ideas, strategies, operating procedures, proposals, reports, emails and other business documents.', actions: [
    { label: 'Brainstorm ideas', tool: 'brainstorm' }, { label: 'Strategy', tool: 'strategy' }, { label: 'Operating procedure', tool: 'sop' },
    { label: 'Proposal or quote', tool: 'proposal' }, { label: 'Business report', tool: 'report' }, { label: 'Customer email', tool: 'email' },
    { label: 'Business plan', tool: 'plan' }, { label: 'Letter or document', tool: 'letter' },
  ] },
  { key: 'creative', icon: 'color-palette-outline', title: 'Creative work', sub: 'Product descriptions, adverts, social posts, articles and video scripts in your brand’s voice.', actions: [
    { label: 'Social media posts', tool: 'social' }, { label: 'Advert', tool: 'advert' }, { label: 'Product description', tool: 'description' },
    { label: 'Blog article', tool: 'blog' }, { label: 'Video script', tool: 'video' }, { label: 'Launch plan', tool: 'launch' },
  ] },
  { key: 'admin', icon: 'briefcase-outline', title: 'Administration', sub: 'Meeting agendas and minutes, job descriptions, policies, summaries and sales scripts.', actions: [
    { label: 'Meeting agenda', tool: 'agenda' }, { label: 'Notes to minutes', tool: 'minutes' }, { label: 'Job description', tool: 'job' },
    { label: 'Business policy', tool: 'policy' }, { label: 'Summarise text', tool: 'summary' }, { label: 'Sales script', tool: 'salesScript' },
  ] },
  { key: 'decide', icon: 'scale-outline', title: 'Decision support', sub: 'Compare options, weigh pros and cons, check risks and price with confidence.', actions: [
    { label: 'Compare options', tool: 'compare' }, { label: 'Pros and cons', tool: 'proscons' }, { label: 'Risk check', tool: 'risk' },
    { label: 'Pricing ideas', tool: 'pricing' }, { label: 'Customer profile', tool: 'persona' },
  ] },
];

export const BRAIN_WORKFLOWS: { title: string; sub: string; steps: BrainAction[] }[] = [
  { title: 'Launch a product', sub: 'From description to posts to a launch plan', steps: [{ label: 'Product description', tool: 'description' }, { label: 'Social media posts', tool: 'social' }, { label: 'Launch plan', tool: 'launch' }] },
  { title: 'Win a new client', sub: 'Know them, offer, follow up', steps: [{ label: 'Customer profile', tool: 'persona' }, { label: 'Proposal or quote', tool: 'proposal' }, { label: 'Customer email', tool: 'email' }] },
  { title: 'Weekly review', sub: 'Numbers, priorities, a written report', steps: [
    { label: 'Analyse my sales', ask: 'Analyse my sales for the last 7 days compared with the week before: what changed, best products and customers, and what needs attention.' },
    { label: 'Plan my week', ask: 'Plan my week: look at my orders to ship, unpaid orders, follow-ups, schedule and low stock, and give me a day-by-day list.' },
    { label: 'Business report', tool: 'report' }] },
  { title: 'Make a decision', sub: 'Options, risks, then a clear choice', steps: [{ label: 'Compare options', tool: 'compare' }, { label: 'Risk check', tool: 'risk' }, { label: 'Pros and cons', tool: 'proscons' }] },
];

// ---- Reusable prompts ----
export type SavedPrompt = { id: string; title: string; content: string; created_at: string };
export async function loadPrompts(): Promise<SavedPrompt[]> {
  const { data, error } = await supabase.from('ai_saved_items').select('id,title,content,created_at').eq('kind', 'prompt').order('updated_at', { ascending: false }).limit(200);
  if (error) throw new Error("Couldn't load your prompts.");
  return (data ?? []) as SavedPrompt[];
}
export async function savePrompt(userId: string, p: { id?: string; title: string; content: string }) {
  const title = p.title.trim().slice(0, 200), content = p.content.trim().slice(0, 20000);
  if (!title || !content) throw new Error('Give the prompt a name and the text.');
  const { error } = p.id
    ? await supabase.from('ai_saved_items').update({ title, content, updated_at: new Date().toISOString() }).eq('id', p.id)
    : await supabase.from('ai_saved_items').insert({ user_id: userId, kind: 'prompt', title, content, tags: [] });
  if (error) throw new Error("Couldn't save the prompt.");
}
export async function deletePrompt(id: string) {
  const { error } = await supabase.from('ai_saved_items').delete().eq('id', id);
  if (error) throw new Error("Couldn't delete the prompt.");
}

/** The business knowledge Brain uses: Verified and Need review items count; drafts are never used. */
export type Coverage = { category: string; verified: number; review: number; drafts: number };
export async function knowledgeCoverage(): Promise<Coverage[]> {
  const { data } = await supabase.from('knowledge_items').select('category,status').limit(2000);
  const by = new Map<string, Coverage>();
  for (const r of (data ?? []) as { category: string; status: string }[]) {
    const c = by.get(r.category) ?? { category: r.category, verified: 0, review: 0, drafts: 0 };
    if (r.status === 'Draft') c.drafts++; else if (r.status === 'Verified') c.verified++; else c.review++;
    by.set(r.category, c);
  }
  return ['products', 'services', 'faqs', 'policies', 'operations'].map(category => by.get(category) ?? { category, verified: 0, review: 0, drafts: 0 });
}
