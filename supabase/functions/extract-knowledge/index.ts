import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GROQ = "https://api.groq.com/openai/v1";
const MAX_ITEMS = 40;
const CHUNK = 8000; // characters per request: keeps each call well under Groq's per-minute token limit
const MAX_CHUNKS = 4;
const CATEGORIES = ["products", "services", "operations", "policies", "faqs"];
const PREFERRED = (Deno.env.get("GROQ_AGENT_MODELS") || "openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,qwen/qwen3-32b,llama-3.1-8b-instant")
  .split(",").map((s) => s.trim()).filter(Boolean);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: unknown, max = 500): string => (typeof s === "string" ? s.trim().slice(0, max) : "");

// Plan limit: analysing a document is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("[extract-knowledge] ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

async function models(key: string): Promise<string[]> {
  try {
    const res = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const ids = ((await res.json())?.data ?? []).map((m: any) => m.id as string);
      const list = PREFERRED.filter((m) => ids.includes(m));
      if (list.length) return list;
    }
  } catch { /* fall back to the preference list */ }
  return PREFERRED;
}

const PROMPT = `You extract structured business knowledge from the document text for a business AI assistant.
Return ONLY a JSON object (no markdown, no commentary) of this exact shape:
{"items":[{"category":"products|services|operations|policies|faqs","name":string,"subtitle":string,"overview":string,"fields":[{"label":string,"value":string}],"features":[string]}]}
Rules:
- Only include facts that are actually in the text. Never invent prices, specs or policies.
- products: fields may include Category, Specification, Brand, Price. subtitle looks like "Accessories · $59.00" when a price exists.
- services: fields may include Category, Price. policies/operations: put the rules or details in "features" as short bullet strings.
- faqs: name is the question, overview is the answer.
- Keep every string under 400 characters. At most 15 items. If nothing useful is found return {"items":[]}.`;

async function extractChunk(key: string, text: string, list: string[]): Promise<any[]> {
  let lastErr = "";
  for (let pass = 0; pass < 2; pass++) {
    let wait = 0;
    for (const model of list) {
      const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: PROMPT }, { role: "user", content: `DOCUMENT TEXT:\n${text}` }], temperature: 0.1, max_tokens: 2500 };
      if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
      const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
      const raw = await res.text();
      if (res.ok) {
        const content = JSON.parse(raw)?.choices?.[0]?.message?.content ?? "";
        const m = String(content).replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
        try { return (m ? JSON.parse(m[0])?.items : []) ?? []; } catch { return []; }
      }
      lastErr = `${model}: ${res.status} ${raw.slice(0, 160)}`;
      console.error("[extract-knowledge] groq", lastErr);
      if (res.status === 429) { const mm = /try again in ([\d.]+)(ms|s)/i.exec(raw); if (mm) wait = Math.max(wait, mm[2] === "ms" ? Number(mm[1]) : Number(mm[1]) * 1000); }
    }
    if (wait > 0 && wait <= 8000 && pass === 0) await sleep(wait + 200); else break;
  }
  throw new Error(lastErr || "Groq unavailable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, message: "Please sign in again." }, 401);
    const user = userData.user;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const path = typeof body?.path === "string" ? body.path : "";
    if (!path || path.includes("..") || !path.startsWith(`${user.id}/`)) return json({ success: false, message: "Invalid file path." }, 403);

    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ success: false, message: "Document analysis is not configured." }, 503);
    const quota = await useAiTask(admin, user.id, "check");
    if (quota) return json({ success: false, code: "quota", message: quota }, 429);

    const { data: file, error: dlErr } = await supabase.storage.from("knowledge-files").download(path);
    if (dlErr || !file) return json({ success: false, message: "Could not read the uploaded file." }, 404);

    const lower = path.toLowerCase();
    let text = "";
    if (lower.endsWith(".pdf")) {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
        const out = await extractText(pdf, { mergePages: true });
        text = String(out?.text ?? "");
      } catch (e) {
        console.error("[extract-knowledge] pdf", e);
        return json({ success: false, message: "We couldn't read that PDF. Try exporting it again, or upload a CSV or TXT version." }, 422);
      }
      if (text.replace(/\s+/g, "").length < 40) return json({ success: false, message: "This PDF looks like a scan with no readable text. Upload a text-based PDF, or a CSV/TXT file." }, 422);
    } else if (lower.endsWith(".txt") || lower.endsWith(".csv")) {
      text = await file.text();
    } else {
      return json({ success: false, message: "Please upload a PDF, CSV or TXT file." }, 415);
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const chunks: string[] = [];
    for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));

    const list = await models(key);
    const raw: any[] = [];
    for (const c of chunks) raw.push(...(await extractChunk(key, c, list)));
    await useAiTask(admin, user.id, "document", 1, false);

    const seen = new Set<string>();
    const items = raw.map((it: any) => ({
      category: CATEGORIES.includes(it?.category) ? it.category : "products",
      name: clean(it?.name, 200),
      subtitle: clean(it?.subtitle, 200),
      overview: clean(it?.overview, 800),
      fields: (Array.isArray(it?.fields) ? it.fields : []).slice(0, 8).map((f: any) => ({ label: clean(f?.label, 60), value: clean(f?.value, 300) })).filter((f: any) => f.label && f.value),
      features: (Array.isArray(it?.features) ? it.features : []).slice(0, 12).map((f: any) => clean(f, 300)).filter(Boolean),
    })).filter((it: any) => { const k = it.name.toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_ITEMS);

    return json({ success: true, items, truncated: text.length > CHUNK * MAX_CHUNKS });
  } catch (e) {
    console.error("[extract-knowledge] unexpected", e);
    const busy = /429|rate limit/i.test(String((e as Error)?.message || ""));
    return json({ success: false, message: busy ? "Nexora is busy analysing other files. Please try again in a minute." : "We couldn't analyse that file right now." }, busy ? 429 : 500);
  }
});
