import { supabase } from './supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
async function callFn<T>(name: string, body: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${FUNCTIONS_URL}/${name}`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.success === false) throw new Error(j?.message || `Something went wrong (${r.status}).`);
    return j as T;
  } catch (e) { throw new Error((e as Error).name === 'AbortError' ? 'This is taking too long. Try again in a moment.' : (e as Error).message); }
  finally { clearTimeout(t); }
}
export { callFn as callNexora };

// Autopilot for the Special features (2.1 to 2.4): Nexora runs a capability on a schedule (or now, on request)
// and writes a visual report: figures, charts, real photos, short findings, next steps and online sources.
// The engine is the nexora-autopilot function; the website has the same rules in src/lib/autopilot.ts.

export type Job = 'weekly_briefing' | 'plan_review' | 'social_autopilot' | 'website_watch';
export type Mode = 'report' | 'draft' | 'auto';
export type Autopilot = {
  id?: string; job: Job; enabled: boolean; frequency: 'daily' | 'weekly' | 'monthly'; weekday: number; day_of_month: number; hour: number;
  tz_offset_min: number; mode: Mode; options: Record<string, unknown>; next_run_at?: string | null; last_run_at?: string | null;
  last_status?: '' | 'ok' | 'partial' | 'failed'; last_message?: string; runs?: number;
};
export type Kpi = { label: string; value: number; unit: 'money' | 'count' | 'percent'; change?: number | null; good?: 'up' | 'down'; note?: string };
export type Chart =
  | { type: 'line'; title: string; unit: 'money' | 'count'; x: string[]; series: { name: string; values: (number | null)[]; dashed?: boolean }[]; note?: string }
  | { type: 'bar'; title: string; unit: 'money' | 'count'; items: { label: string; value: number }[] }
  | { type: 'donut'; title: string; items: { label: string; value: number }[] }
  | { type: 'rank'; title: string; unit: 'money' | 'count'; items: { label: string; value: number; sub?: string; image?: string | null }[] }
  | { type: 'heatmap'; title: string; rows: string[]; cols: string[]; grid: number[][] }
  | { type: 'funnel'; title: string; steps: { label: string; value: number }[] }
  | { type: 'progress'; title: string; items: { label: string; value: number; target: number; unit?: string }[] }
  | { type: 'scores'; title: string; items: { label: string; value: number }[]; note?: string }
  | { type: 'list'; title: string; items: { label: string; value?: string; href?: string }[] };
export type ReportData = {
  kpis: Kpi[]; charts: Chart[]; images: { url: string; caption: string; credit?: string; link?: string }[]; highlights: string[];
  actions: { text: string; href?: string }[]; sources: { title: string; url: string }[]; currency?: string; notes?: string[]; created?: Record<string, unknown>;
};
export type Report = { id: string; job: Job; capability: string; trigger: 'schedule' | 'manual'; title: string; summary: string; data: ReportData; read_at: string | null; created_at: string };

/** What each capability's autopilot does, in plain words, and the modes it offers. */
export const JOBS: Record<Job, { name: string; what: string; modes: { k: Mode; label: string; hint: string }[]; defaults: Partial<Autopilot> }> = {
  weekly_briefing: {
    name: 'Weekly business briefing', what: 'Your sales, orders, customers and best sellers in charts, compared with last week, plus market news found online and three things to do.',
    modes: [{ k: 'report', label: 'Send me the briefing', hint: 'A report and a phone notification' }], defaults: { frequency: 'weekly', weekday: 1, hour: 8 },
  },
  plan_review: {
    name: 'Plan review', what: 'Checks your plans against real sales and goals, draws a 6-month estimate, researches your market online and suggests next steps.',
    modes: [{ k: 'report', label: 'Send me the review', hint: 'A report and a phone notification' }], defaults: { frequency: 'monthly', day_of_month: 1, hour: 9 },
  },
  social_autopilot: {
    name: 'Social media autopilot', what: 'Finds your best days, times and platforms, checks what is trending online, and prepares new posts with real product photos.',
    modes: [
      { k: 'report', label: 'Only report', hint: 'Charts and ideas; no posts' },
      { k: 'draft', label: 'Draft posts for me', hint: 'New posts wait in Drafts for you to check' },
      { k: 'auto', label: 'Queue posts at the best time', hint: 'Nexora queues them; they publish automatically' },
    ], defaults: { frequency: 'weekly', weekday: 1, hour: 7, mode: 'draft', options: { posts: 2 } },
  },
  website_watch: {
    name: 'Website watch', what: 'Checks every connected website online (speed, SEO, health), retries failed deliveries and shows visits, enquiries and orders.',
    modes: [{ k: 'report', label: 'Check and report', hint: 'Failed deliveries are retried automatically' }], defaults: { frequency: 'daily', hour: 7 },
  },
};
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const localTz = () => -new Date().getTimezoneOffset();

export function defaultAutopilot(job: Job): Autopilot {
  return { job, enabled: false, frequency: 'weekly', weekday: 1, day_of_month: 1, hour: 8, tz_offset_min: localTz(), mode: 'report', options: {}, ...JOBS[job].defaults } as Autopilot;
}
const COLS = 'id,job,enabled,frequency,weekday,day_of_month,hour,tz_offset_min,mode,options,next_run_at,last_run_at,last_status,last_message,runs';
export async function loadAutopilot(job: Job): Promise<Autopilot> {
  const { data, error } = await supabase.from('autopilots').select(COLS).eq('job', job).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Autopilot | null) ?? defaultAutopilot(job);
}
export async function saveAutopilot(a: Autopilot): Promise<Autopilot> {
  const row = { job: a.job, enabled: a.enabled, frequency: a.frequency, weekday: a.weekday, day_of_month: a.day_of_month, hour: a.hour, tz_offset_min: localTz(), mode: a.mode, options: a.options ?? {} };
  const r = a.id
    ? await supabase.from('autopilots').update(row).eq('id', a.id).select(COLS).single()
    : await supabase.from('autopilots').insert({ ...row, capability: 'brain' }).select(COLS).single();   // capability is set by the database from the job
  if (r.error) throw new Error(r.error.message);
  return r.data as Autopilot;
}
/** Runs the job now (takes up to about two minutes when it researches online). */
export const runAutopilot = (job: Job, options?: Record<string, unknown>, mode?: Mode) =>
  callFn<{ id: string | null; status: string; title: string; summary: string }>('nexora-autopilot', { action: 'run', job, options, mode }, 150000);
export async function loadReports(job: Job, limit = 8): Promise<Report[]> {
  const { data, error } = await supabase.from('autopilot_reports').select('id,job,capability,trigger,title,summary,data,read_at,created_at').eq('job', job).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Report[]).map(r => ({ ...r, data: { ...(r.data ?? {}), kpis: r.data?.kpis ?? [], charts: r.data?.charts ?? [], images: r.data?.images ?? [], highlights: r.data?.highlights ?? [], actions: r.data?.actions ?? [], sources: r.data?.sources ?? [] } }));
}
export const markRead = (id: string) => supabase.from('autopilot_reports').update({ read_at: new Date().toISOString() }).eq('id', id).then(() => {});
export async function deleteReport(id: string) { const { error } = await supabase.from('autopilot_reports').delete().eq('id', id); if (error) throw new Error(error.message); }

/** "Every Monday at 8:00", "Every day at 7:00", "On the 1st of each month at 9:00". */
export function scheduleText(a: Autopilot) {
  const t = `${a.hour}:00`;
  return a.frequency === 'daily' ? `Every day at ${t}` : a.frequency === 'weekly' ? `Every ${WEEKDAYS[a.weekday]} at ${t}` : `On day ${a.day_of_month} of each month at ${t}`;
}
