import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora agent (Groq) with RAG: every question is answered from the passages
// retrieved for it by hybrid search (gte-small embeddings + full text) over the
// business's knowledge items and uploaded documents (table knowledge_chunks).
declare const Supabase: any;
declare const EdgeRuntime: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-internal-owner",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GROQ = "https://api.groq.com/openai/v1";
const MAX_STEPS = 4;
const RAG_TOP_K = 6;
// gte-small scores are compressed: on this knowledge base unrelated passages score ~0.74-0.80
// (median 0.77, 90th percentile 0.80) and related ones 0.85+. Keyword hits are always kept.
const RAG_MIN_SIMILARITY = Number(Deno.env.get("RAG_MIN_SIMILARITY") || 0.81);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Plan limit: each AI reply or action Nexora takes is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("[nexora-agent] ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

let embedder: any = null;
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    if (!embedder) embedder = new Supabase.ai.Session("gte-small");
    const out = await embedder.run(text.slice(0, 1500), { mean_pool: true, normalize: true });
    return Array.from(out as ArrayLike<number>);
  } catch (e) {
    console.error("[nexora-agent] embed", e);
    return null;
  }
}

/* ---------------- Groq model discovery ---------------- */
// Each Groq model has its own rate-limit bucket, so we walk a preference list and skip anything the account can't use.
const PREFERRED = (Deno.env.get("GROQ_AGENT_MODELS") || "openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,qwen/qwen3-32b,llama-3.1-8b-instant")
  .split(",").map((s) => s.trim()).filter(Boolean);
let modelCache: { at: number; ids: string[] } | null = null;
async function availableModels(key: string): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.ids;
  try {
    const res = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const ids = ((await res.json())?.data ?? []).map((m: any) => m.id as string);
      if (ids.length) { modelCache = { at: Date.now(), ids }; return ids; }
    }
  } catch { /* use the preference list as-is */ }
  return [];
}
async function chatModels(key: string): Promise<string[]> {
  const ids = await availableModels(key);
  const list = ids.length ? PREFERRED.filter((m) => ids.includes(m)) : PREFERRED;
  return list.length ? list : PREFERRED;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryAfterMs = (text: string): number => {
  const m = /try again in ([\d.]+)(ms|s)/i.exec(text);
  if (!m) return 0;
  return m[2].toLowerCase() === "ms" ? Number(m[1]) : Number(m[1]) * 1000;
};

/* ---------------- helpers ---------------- */
const toMin = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((t || "").trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
};
const fmt = (mins: number) => {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/* Live web research: Groq compound models when the account has them, otherwise
   gpt-oss with the built-in browser_search tool (works on standard Groq accounts). */
async function webResearch(groqKey: string, query: string) {
  const ids = await availableModels(groqKey);
  const has = (m: string) => !ids.length || ids.includes(m);
  const messages = [
    { role: "system", content: "You are a business research assistant. Search the web and report current, factual findings with dates. Maximum 5 short bullet points. Do not invent facts." },
    { role: "user", content: query },
  ];
  const attempts: Record<string, unknown>[] = [
    ...["groq/compound-mini", "groq/compound"].filter((m) => ids.includes(m)).map((model) => ({ model, messages, temperature: 0.2, max_tokens: 700 })),
    ...["openai/gpt-oss-120b", "openai/gpt-oss-20b"].filter(has).flatMap((model) => [
      { model, messages, temperature: 0.2, max_tokens: 1500, tools: [{ type: "browser_search" }], tool_choice: "required" },
      { model, messages, temperature: 0.2, max_tokens: 1500, tools: [{ type: "browser_search" }], tool_choice: "auto" },
    ]),
  ];
  if (!attempts.length) return { error: "Live web search isn't enabled on this Groq account." };
  for (const payload of attempts) {
    try {
      const res = await fetch(`${GROQ}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      if (!res.ok) { console.error("[nexora-agent] web", payload.model, res.status, raw.slice(0, 200)); continue; }
      const msg = JSON.parse(raw)?.choices?.[0]?.message;
      const seen = new Set<string>();
      const sources: { title: string; url: string }[] = [];
      for (const t of msg?.executed_tools ?? []) {
        for (const r of t?.search_results?.results ?? []) {
          if (typeof r?.url === "string" && /^https?:\/\//.test(r.url) && !seen.has(r.url)) { seen.add(r.url); sources.push({ title: clip(r.title, 120) || r.url, url: r.url }); }
        }
      }
      const text = String(msg?.content ?? "").replace(/【[^】]*】/g, "").trim();
      if (text) return { summary: text.slice(0, 2500), sources: sources.slice(0, 5) };
    } catch (e) { console.error("[nexora-agent] web error", e); }
  }
  return { error: "Web search is unavailable right now." };
}

/* ---------------- tool schemas ---------------- */
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const T = {
  search_knowledge: fn("search_knowledge", "Search the business knowledge base (products, services, policies, FAQs and uploaded documents) for passages that answer a question. Use it whenever the retrieved knowledge in the prompt doesn't already answer.", { query: { type: "string" } }, ["query"]),
  search_web: fn("search_web", "Search the live web for current trends, news, competitors, regulations or suppliers. Returns a summary and real source links.", { query: { type: "string" } }, ["query"]),
  get_business_overview: fn("get_business_overview", "Live business metrics: orders this week vs last, unshipped orders, top products, customers, knowledge health, escalations, upcoming events.", {}),
  check_availability: fn("check_availability", "List free slots between 9:00 AM and 5:00 PM on a date.", { date: { type: "string", description: "YYYY-MM-DD" }, duration_minutes: { type: "integer" } }, ["date"]),
  list_schedule: fn("list_schedule", "List the owner's events between two dates.", { from_date: { type: "string" }, to_date: { type: "string" } }, ["from_date", "to_date"]),
  create_schedule_event: fn("create_schedule_event", "Book a meeting, task or follow-up. Fails with suggested times if the slot is taken.", {
    title: { type: "string" }, with_whom: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" },
    start_time: { type: "string", description: "like 10:00 AM" }, end_time: { type: "string" },
    event_type: { type: "string", enum: ["meeting", "task", "follow_up"] }, notes: { type: "string" },
  }, ["title", "date", "start_time"]),
  lookup_orders: fn("lookup_orders", "Look up orders. status: pending, processing, shipped, delivered, cancelled or unshipped.", { status: { type: "string" }, customer_name: { type: "string" } }),
  mark_order_shipped: fn("mark_order_shipped", "Mark an order as shipped (owner only).", { order_id: { type: "string" }, customer_name: { type: "string" }, tracking: { type: "string" } }),
  save_customer: fn("save_customer", "Save a new customer contact.", { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } }, ["name"]),
  apply_owner_rule: fn("apply_owner_rule", "Use one of the OWNER RULES to handle this yourself instead of escalating. Call it when the situation clearly matches a rule and stays within its limits; then tell the customer the outcome.", { rule_number: { type: "integer" }, what_you_did: { type: "string", description: "one short sentence" } }, ["rule_number", "what_you_did"]),
  escalate_to_owner: fn("escalate_to_owner", "Flag this for the business owner (complaint, refund exception, anything not answerable from the knowledge base).", { reason: { type: "string" }, urgency: { type: "string", enum: ["low", "normal", "high"] } }, ["reason"]),
};

type Passage = { id: string; source_type: string; item_id: string | null; document_id: string | null; title: string; category: string; content: string; similarity: number; keyword?: boolean; score: number; source_url?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);

  try {
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) return json({ success: false, message: "The AI service isn't configured yet." }, 503);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    // Server-to-server call from the message webhook: trusted by the service key, scoped to one business owner.
    const ownerHdr = req.headers.get("x-internal-owner") ?? "";
    const internal = authHeader === `Bearer ${serviceKey}` && /^[0-9a-f-]{36}$/i.test(ownerHdr);
    const supabase = internal
      ? createClient(url, serviceKey)
      : createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const usage = createClient(url, serviceKey);   // only for counting AI tasks
    let userId = ownerHdr;
    if (!internal) {
      const { data: ud, error: ue } = await supabase.auth.getUser();
      if (ue || !ud?.user) return json({ success: false, message: "Please sign in again." }, 401);
      userId = ud.user.id;
    }
    // every read/write below belongs to this owner, even when running with the service key
    const own = (b: any) => (internal ? b.eq("user_id", userId) : b);

    const body = await req.json().catch(() => ({}));
    const message = clip(body?.message, 4000);
    if (!message) return json({ success: false, message: "No message provided." }, 400);
    const customer = { name: clip(body?.customer?.name, 120) || "the customer", channel: clip(body?.customer?.channel, 30), conversation_id: /^[0-9a-f-]{36}$/i.test(String(body?.customer?.conversation_id ?? "")) ? String(body.customer.conversation_id) : null };
    const now = {
      date: isDate(body?.client_now?.date) ? body.client_now.date : new Date().toISOString().slice(0, 10),
      time: clip(body?.client_now?.time, 12) || "",
      tz: clip(body?.client_now?.tz, 60) || "UTC",
    };
    const weekday = new Date(`${now.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

    /* ---------- workspace / role / limits ---------- */
    let ws: any = null;
    if (internal) {
      const { data: b } = await supabase.from("businesses").select("name,industry").eq("owner_id", userId).maybeSingle();
      ws = b ? { ...b, role: "owner" } : null;
    } else {
      const wsR = await supabase.rpc("my_workspace");
      ws = Array.isArray(wsR.data) ? wsR.data[0] : wsR.data;
    }
    const role: "owner" | "staff" | "none" = ws?.role === "staff" ? "staff" : ws?.role === "owner" ? "owner" : "none";
    let mode: "assistant" | "autopilot" | "staff" = internal || body?.mode === "autopilot" ? "autopilot" : "assistant";
    if (role === "staff") mode = "staff";
    // Staff use the owner's knowledge base.
    const kbOwner = role === "staff" ? (await supabase.from("businesses").select("owner_id").eq("id", ws?.business_id ?? "").maybeSingle()).data?.owner_id || userId : userId;

    // Plan limit: owners, staff and customer auto-replies all use the business's AI tasks.
    // (A paid plan that wasn't renewed simply falls back to the Free plan's AI tasks.)
    const quota = await useAiTask(usage, userId, "check");
    if (quota) return json({ success: false, code: "quota", message: quota }, 429);

    /* ---------- context (kept small: Groq on-demand tiers allow only ~8k tokens per minute) ---------- */
    const [profileR, kbR, chR] = await Promise.all([
      supabase.from("profiles").select("full_name,business_name").eq("id", userId).maybeSingle(),
      own(supabase.from("knowledge_items").select("category,name,subtitle,status,overview,fields,features").neq("status", "Draft").order("created_at").limit(300)),
      mode === "autopilot" && customer.channel
        ? own(supabase.from("channel_connections").select("ai_behavior,ai_permissions").eq("channel_key", customer.channel.toLowerCase())).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    // Decisions the owner already made once ("Decide once"): Nexora applies them instead of asking again.
    let rules: { id: string; situation: string; action: string; limits: string | null }[] = [];
    if (mode === "autopilot") {
      const rr = await own(supabase.from("owner_rules").select("id,situation,action,limits").eq("enabled", true)).order("created_at").limit(30);
      if (!rr.error) rules = rr.data ?? [];
    }
    const rulesText = rules.length
      ? `\nOWNER RULES (decisions the owner already made; they count as the owner's policy, also for refunds, but only within their limits; when a situation clearly matches one and stays within its limits, follow it and call apply_owner_rule instead of escalating; never stretch a rule beyond its limits; if unsure, escalate):\n${rules.map((r, i) => `${i + 1}. ${r.situation} -> ${r.action}${r.limits ? ` (limit: ${r.limits})` : ""}`).join("\n")}\n`
      : "";
    const myName = profileR.data?.full_name || "";
    const owner = (role === "staff" ? ws?.owner_name : myName) || "the owner";
    const business = ws?.name || profileR.data?.business_name || "the business";
    const industry = ws?.industry || "";
    const kb = (kbR.data ?? []) as any[];
    const behavior = { autoReply: true, askApproval: true, escalate: true, ...(((chR as any).data?.ai_behavior) ?? {}) };
    const perms = { answerQuestions: true, followUp: true, handleRefunds: true, supportTickets: true, ...(((chR as any).data?.ai_permissions) ?? {}) };
    const sideEffectsAllowed = mode === "assistant" || (mode === "autopilot" && !behavior.askApproval && perms.followUp);

    const line = (i: any, full = true) => {
      if (!full) return `- [${i.category}] ${i.name}${i.subtitle ? ` (${i.subtitle})` : ""}`;
      const f = (i.fields ?? []).filter((x: any) => x?.label && x.label !== "Status").map((x: any) => `${x.label}: ${x.value}`).join("; ");
      return `- [${i.category}] ${i.name}${i.subtitle ? ` (${i.subtitle})` : ""}${i.overview ? ` - ${String(i.overview).slice(0, 220)}` : ""}${f ? ` | ${f}` : ""}${i.features?.length ? ` | ${i.features.slice(0, 6).join("; ")}` : ""}`;
    };
    // Keyword ranking: only used if the RAG index isn't available.
    const tokensOf = (t: string) => t.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    const rank = (text: string) => {
      const tk = tokensOf(text);
      return kb.map((i) => ({ i, score: tk.reduce((n, t) => n + (line(i).toLowerCase().includes(t) ? 1 : 0), 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    };

    /* ---------- RAG: retrieve the passages that answer this question ---------- */
    const passages: Passage[] = [];
    let ragOk = false;
    const retrieve = async (q: string, k = RAG_TOP_K): Promise<Passage[]> => {
      const v = await embedQuery(q);
      const { data, error } = await supabase.rpc("match_knowledge", { p_user: kbOwner, query_embedding: v ? JSON.stringify(v) : null, query_text: q.slice(0, 500), match_count: k });
      if (error) { console.error("[nexora-agent] rag", error.message); return []; }
      ragOk = true;
      // Keep passages that are actually related (semantic match or keyword hit).
      // (Older versions of match_knowledge have no "keyword" column: a similarity of 0 then means a keyword-only hit.)
      return ((data ?? []) as Passage[]).filter((p) => (p.keyword ?? p.similarity === 0) || p.similarity >= RAG_MIN_SIMILARITY);
    };
    const addPassages = (list: Passage[]) => {
      for (const p of list) if (!passages.some((x) => x.id === p.id)) passages.push(p);
    };
    const passageText = (p: Passage, n: number) => `[${n}] ${p.source_type === "document" ? `Document: ${p.title}` : p.source_type === "web" ? `Online research (${p.category}): ${p.title}` : `${p.category}: ${p.title}`}\n${String(p.content).slice(0, 700)}`;

    const histText = (Array.isArray(body?.history) ? body.history : []).slice(-2).map((m: any) => (typeof m?.content === "string" ? m.content : "")).join(" ");
    addPassages(await retrieve(`${message}\n${histText}`.trim()));

    const indexText = kb.map((i) => line(i, false)).join("\n").slice(0, 1200);
    let kbText: string;
    if (ragOk) {
      kbText = passages.length
        ? `RETRIEVED KNOWLEDGE (most relevant first):\n${passages.map((p, i) => passageText(p, i + 1)).join("\n\n")}`
        : "RETRIEVED KNOWLEDGE: nothing in the knowledge base matches this question.";
      if (kb.length) kbText += `\n\nALL ITEM NAMES (for orientation only; use search_knowledge for details):\n${indexText}`;
    } else {
      const top = rank(`${message} ${histText}`).slice(0, 6).map((x) => x.i);
      const detailText = top.map((i) => line(i)).join("\n").slice(0, 2400);
      kbText = kb.length ? `ITEMS:\n${indexText}\n\nMOST RELEVANT DETAILS:\n${detailText || "(none matched)"}` : "(nothing has been added yet)";
    }

    // Embed any passages still waiting (new items, new uploads) in the background, so they are searchable next time.
    try {
      const { count } = await supabase.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("user_id", kbOwner).is("embedding", null);
      if ((count ?? 0) > 0) {
        const job = fetch(`${url}/functions/v1/rag-index`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json", "x-internal-owner": kbOwner }, body: JSON.stringify({ action: "embed" }) }).catch(() => {});
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
      }
    } catch { /* index table not installed yet */ }

    const where = industry ? `${business} (${industry})` : business;
    const linkRule = "When you use search_web, mention 2-4 returned sources as markdown links [title](url). Only use URLs returned by the tool; never invent a link. Online research passages are from the web, not from the owner: say so when you use them. Items whose text starts with \"Updated:\" are the owner's newest information and override older passages. If the retrieved knowledge doesn't answer a question about the market, competitors, prices elsewhere, industry concepts, regulations or anything current, call search_web instead of guessing.";
    const citeRule = ragOk ? "Base factual answers on the RETRIEVED KNOWLEDGE. After a sentence that uses a passage, add its number in square brackets, e.g. [2]. If the retrieved knowledge does not contain the answer, call search_knowledge once with a better query; if it is still missing, say so plainly." : "";

    const system = mode === "assistant"
      ? `You are Nexora, the AI business assistant for ${where}, working with ${owner}, the owner. Today is ${weekday} ${now.date}${now.time ? `, ${now.time}` : ""} (${now.tz}).\nRun the business: answer from the knowledge base; use tools for the schedule, orders, customers and live metrics (get_business_overview); research trends or news with search_web. Be concise. Never claim an action happened unless a tool returned success. Never invent prices, stock or policies; if the knowledge base lacks it, say so and suggest adding it under Train AI. Ask before destructive changes. On a time conflict offer the suggested times. ${citeRule} ${linkRule}\n\n${kbText}`
      : mode === "staff"
      ? `You are Nexora, the friendly AI mentor helping a new staff member${myName ? ` (${myName})` : ""} learn ${where}. The owner is ${owner}. Today is ${weekday} ${now.date}.\nTeach using ONLY the business knowledge: explain products, services, policies and procedures simply, with examples of what to say to customers. When asked, quiz one question at a time, then reveal and explain. You cannot see customers, orders, revenue or schedules, so never discuss them. If something is not in the knowledge base say so and suggest asking ${owner}. ${citeRule} ${linkRule}\n\n${kbText}`
      : `You are Nexora, replying for ${where} to ${customer.name}${customer.channel ? ` on ${customer.channel}` : ""} while the owner (${owner}) is unavailable. Today is ${weekday} ${now.date}${now.time ? `, ${now.time}` : ""} (${now.tz}).\nWrite as the business: friendly, max 3 short sentences, plain text, no markdown, no signature, no bracketed numbers.\nRULES: Only state facts from the RETRIEVED KNOWLEDGE or tool results. Never invent prices, stock, policies or delivery times. Never take payments, never promise refunds outside the refund policy, never reveal other customers' data or the owner's schedule details. If you can't answer confidently, or it is a complaint, refund exception, legal or safety matter, call escalate_to_owner and tell the customer ${owner} will follow up personally. If the customer is abusive or threatening, stay polite, do not engage, and call escalate_to_owner.${rulesText}\nPERMISSIONS: answer questions=${perms.answerQuestions}; follow up/schedule=${perms.followUp}; refunds within policy=${perms.handleRefunds}; support tickets=${perms.supportTickets}. Anything not permitted must be escalated.${sideEffectsAllowed ? "" : "\nYou are drafting for the owner to approve: do not book anything; you may propose times."}\n\n${kbText}`;

    const toolNames = mode === "assistant"
      ? ["search_knowledge", "search_web", "get_business_overview", "check_availability", "list_schedule", "create_schedule_event", "lookup_orders", "mark_order_shipped", "save_customer", "escalate_to_owner"]
      : mode === "staff"
      ? ["search_knowledge", "search_web"]
      : ["search_knowledge", "check_availability", "lookup_orders", "escalate_to_owner", ...(rules.length ? ["apply_owner_rule"] : []), ...(sideEffectsAllowed ? ["create_schedule_event"] : [])];
    const tools = toolNames.map((n) => (T as any)[n]);

    /* ---------- tool execution ---------- */
    const actions: { tool: string; ok: boolean; summary: string }[] = [];
    const links: { title: string; url: string }[] = [];
    let escalated = false;

    const eventsOn = async (date: string) => {
      const { data } = await own(supabase.from("schedule_events").select("title,start_time,end_time").eq("event_date", date).neq("status", "cancelled"));
      return (data ?? []).map((e: any) => { const s = toMin(e.start_time) ?? 0; return { title: e.title, s, e: toMin(e.end_time) ?? s + 60 }; });
    };
    const freeSlots = (evs: { s: number; e: number }[], dur: number) => {
      const out: string[] = [];
      for (let s = 9 * 60; s + dur <= 17 * 60 && out.length < 6; s += 30) if (!evs.some((x) => s < x.e && s + dur > x.s)) out.push(fmt(s));
      return out;
    };

    const run = async (name: string, a: any): Promise<unknown> => {
      switch (name) {
        case "search_knowledge": {
          const q = clip(a?.query, 300);
          if (!q) return { error: "query is required" };
          if (ragOk) {
            const found = await retrieve(q, 5);
            const start = passages.length;
            addPassages(found);
            const fresh = passages.slice(start);
            const all = found.map((p) => passageText(p, passages.findIndex((x) => x.id === p.id) + 1));
            return { results: all.length ? all : ["No matching passages."], new_passages: fresh.length };
          }
          return { results: rank(q).slice(0, 5).map((x) => line(x.i)) };
        }
        case "search_web": {
          const q = clip(a?.query, 300);
          if (!q) return { error: "query is required" };
          const r: any = await webResearch(groqKey, industry && !q.toLowerCase().includes(industry.toLowerCase()) ? `${q} (business context: ${industry})` : q);
          for (const s of r.sources ?? []) if (!links.some((l) => l.url === s.url)) links.push(s);
          // Remember what was found online for a week, so similar questions are answered from the knowledge base.
          if (r.summary && ragOk && mode !== "staff") {
            const admin = createClient(url, serviceKey);
            const save = admin.from("knowledge_chunks").insert({
              user_id: kbOwner, source_type: "web", category: "search", title: `Online: ${q}`.slice(0, 200),
              content: String(r.summary).slice(0, 1500), source_url: r.sources?.[0]?.url ?? null,
              expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            }).then(({ error }: any) => { if (error) console.error("[nexora-agent] cache web", error.message); });
            if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(save);
          }
          return r;
        }
        case "get_business_overview": {
          if (mode !== "assistant") return { error: "Not allowed." };
          const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
          const [ordR, custR, escR, kbAll, evR] = await Promise.all([
            supabase.from("orders").select("items,total,status,created_at").gte("created_at", since14).order("created_at", { ascending: false }).limit(500),
            supabase.from("customers").select("created_at"),
            supabase.from("escalations").select("id").eq("status", "open"),
            supabase.from("knowledge_items").select("status"),
            supabase.from("schedule_events").select("title,event_date,start_time").gte("event_date", now.date).neq("status", "cancelled").order("event_date").limit(5),
          ]);
          const orders = (ordR.data ?? []) as any[];
          const cutoff7 = Date.now() - 7 * 86400000;
          const thisWeek = orders.filter((o) => new Date(o.created_at).getTime() >= cutoff7);
          const lastWeek = orders.filter((o) => new Date(o.created_at).getTime() < cutoff7);
          const sum = (l: any[]) => Math.round(l.reduce((n, o) => n + Number(o.total || 0), 0) * 100) / 100;
          const prod: Record<string, number> = {};
          for (const o of thisWeek) for (const part of String(o.items || "").split(",")) {
            const m = /^\s*(.*?)\s*(?:x\s*(\d+))?\s*$/i.exec(part);
            if (m && m[1]) prod[m[1]] = (prod[m[1]] || 0) + Number(m[2] || 1);
          }
          const customers = (custR.data ?? []) as any[];
          const ks = (kbAll.data ?? []) as any[];
          return {
            orders_this_week: thisWeek.length, revenue_this_week: sum(thisWeek), orders_last_week: lastWeek.length, revenue_last_week: sum(lastWeek),
            unshipped_now: orders.filter((o) => o.status === "pending" || o.status === "processing").length,
            unshipped_over_24h: orders.filter((o) => (o.status === "pending" || o.status === "processing") && Date.now() - new Date(o.created_at).getTime() > 86400000).length,
            top_products_this_week: Object.entries(prod).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, q]) => ({ name: n, units: q })),
            customers_total: customers.length, new_customers_7d: customers.filter((c) => new Date(c.created_at).getTime() >= cutoff7).length,
            knowledge_items: ks.length, knowledge_verified: ks.filter((k) => k.status === "Verified").length, knowledge_need_review: ks.filter((k) => k.status === "Need review").length,
            open_escalations: (escR.data ?? []).length, upcoming_events: evR.data ?? [],
          };
        }
        case "check_availability": {
          if (!isDate(a?.date)) return { error: "date must be YYYY-MM-DD" };
          const dur = Math.min(240, Math.max(15, Number(a?.duration_minutes) || 60));
          return { date: a.date, free_slots: freeSlots(await eventsOn(a.date), dur) };
        }
        case "list_schedule": {
          if (!isDate(a?.from_date) || !isDate(a?.to_date)) return { error: "dates must be YYYY-MM-DD" };
          const { data } = await supabase.from("schedule_events").select("title,with_whom,event_date,start_time,end_time,event_type,status")
            .gte("event_date", a.from_date).lte("event_date", a.to_date).neq("status", "cancelled").order("event_date").limit(30);
          return { events: data ?? [] };
        }
        case "create_schedule_event": {
          if (!sideEffectsAllowed) return { error: "Booking is not allowed right now." };
          const title = clip(a?.title, 200);
          if (!title) return { error: "title is required" };
          if (!isDate(a?.date)) return { error: "date must be YYYY-MM-DD" };
          const s = toMin(a?.start_time);
          if (s === null) return { error: "start_time must look like 10:00 AM" };
          const e = toMin(a?.end_time) ?? s + 60;
          if (e <= s) return { error: "end_time must be after start_time" };
          const clash = (await eventsOn(a.date)).filter((x) => s < x.e && e > x.s);
          if (clash.length) return { success: false, conflict: true, conflicting: clash.map((c) => c.title), suggested_times: freeSlots(await eventsOn(a.date), e - s) };
          const type = ["meeting", "task", "follow_up"].includes(a?.event_type) ? a.event_type : "meeting";
          const { error } = await supabase.from("schedule_events").insert({
            user_id: userId, title, with_whom: clip(a?.with_whom, 200), event_date: a.date, start_time: fmt(s), end_time: fmt(e),
            notes: clip(a?.notes, 500), event_type: type, created_by: "ai",
          });
          if (error) return { success: false, error: "Could not save the event." };
          return { success: true, booked: { title, date: a.date, start_time: fmt(s), end_time: fmt(e) } };
        }
        case "lookup_orders": {
          let q = own(supabase.from("orders").select("id,customer_name,items,total,status,tracking,created_at")).order("created_at", { ascending: false }).limit(10);
          const st = clip(a?.status, 20).toLowerCase();
          if (st === "unshipped") q = q.in("status", ["pending", "processing"]);
          else if (["pending", "processing", "shipped", "delivered", "cancelled"].includes(st)) q = q.eq("status", st);
          const who = mode === "autopilot" ? customer.name : clip(a?.customer_name, 120);
          if (who && who !== "the customer") q = q.ilike("customer_name", `%${who.replace(/[%_]/g, "")}%`);
          else if (mode === "autopilot") return { orders: [] };
          const { data, error } = await q;
          if (error) return { error: "Could not load orders." };
          return { count: data?.length ?? 0, orders: data ?? [] };
        }
        case "mark_order_shipped": {
          if (mode !== "assistant") return { error: "Not allowed." };
          let q = supabase.from("orders").select("id,customer_name").in("status", ["pending", "processing"]).order("created_at", { ascending: false }).limit(1);
          if (typeof a?.order_id === "string" && /^[0-9a-f-]{36}$/i.test(a.order_id)) q = q.eq("id", a.order_id);
          else if (clip(a?.customer_name, 120)) q = q.ilike("customer_name", `%${clip(a.customer_name, 120).replace(/[%_]/g, "")}%`);
          else return { error: "Provide order_id or customer_name" };
          const { data } = await q;
          const row = data?.[0];
          if (!row) return { success: false, error: "No unshipped order matched." };
          const { error } = await supabase.from("orders").update({ status: "shipped", shipped_at: new Date().toISOString(), tracking: clip(a?.tracking, 80) }).eq("id", row.id);
          return error ? { success: false, error: "Could not update the order." } : { success: true, order_id: row.id, customer: row.customer_name };
        }
        case "save_customer": {
          if (mode !== "assistant") return { error: "Not allowed." };
          const name = clip(a?.name, 200);
          if (!name) return { error: "name is required" };
          const email = clip(a?.email, 200).toLowerCase();
          const phone = clip(a?.phone, 40);
          const { error } = await supabase.from("customers").insert({ user_id: userId, name, channel: email ? "Email" : "Whatsapp", handle: email || phone, segment: "New" });
          // P0001 = the plan's customer record limit (the message says what to do)
          return error ? { success: false, error: error.code === "P0001" ? error.message : "Could not save the customer." } : { success: true, saved: name };
        }
        case "escalate_to_owner": {
          const reason = clip(a?.reason, 500);
          if (!reason) return { error: "reason is required" };
          const urgency = ["low", "normal", "high"].includes(a?.urgency) ? a.urgency : "normal";
          const row: Record<string, unknown> = { user_id: userId, customer_name: mode === "autopilot" ? customer.name : "", channel: customer.channel, reason, urgency };
          let { error } = await supabase.from("escalations").insert(customer.conversation_id ? { ...row, conversation_id: customer.conversation_id } : row);
          if (error && customer.conversation_id) ({ error } = await supabase.from("escalations").insert(row));   // older database without the column
          if (!error) escalated = true;
          return error ? { success: false } : { success: true, note: "The owner has been notified." };
        }
        case "apply_owner_rule": {
          const r = rules[Number(a?.rule_number) - 1];
          if (!r) return { error: "No such rule. Escalate instead." };
          const did = clip(a?.what_you_did, 300) || r.action;
          const admin = createClient(url, serviceKey);
          const { data: cur } = await admin.from("owner_rules").select("uses").eq("id", r.id).maybeSingle();
          await admin.from("owner_rules").update({ uses: (cur?.uses ?? 0) + 1, last_used_at: new Date().toISOString() }).eq("id", r.id);
          // Logged as an already-solved item so the owner sees what was decided for them (it never rings them).
          await admin.from("escalations").insert({ user_id: userId, customer_name: customer.name, channel: customer.channel, reason: `Handled by your rule (${r.situation}): ${did}`, urgency: "low", status: "resolved", handled_by: "rule", rule_id: r.id, decision: did, decided_at: new Date().toISOString(), ...(customer.conversation_id ? { conversation_id: customer.conversation_id } : {}) });
          return { success: true, note: "Applied. Tell the customer the outcome." };
        }
        default: return { error: `Unknown tool ${name}` };
      }
    };

    /* ---------- Groq loop ---------- */
    const history = (Array.isArray(body?.history) ? body.history : []).slice(-8)
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1200) }));
    const messages: any[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
    const models = await chatModels(groqKey);

    const callGroq = async (): Promise<{ msg: any; model: string }> => {
      let lastErr = "";
      for (let pass = 0; pass < 2; pass++) {
        let wait = 0;
        for (const model of models) {
          const payload: Record<string, unknown> = { model, messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 700 };
          if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
          const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` }, body: JSON.stringify(payload) });
          const raw = await res.text();
          if (res.ok) {
            try { const msg = JSON.parse(raw)?.choices?.[0]?.message; if (msg) return { msg, model }; } catch { /* next model */ }
          }
          lastErr = `${model}: ${res.status} ${raw.slice(0, 160)}`;
          console.error("[nexora-agent] groq", lastErr);
          if (res.status === 429) wait = Math.max(wait, retryAfterMs(raw));
        }
        // every model was rate limited: wait a few seconds once, then try the list again
        if (wait > 0 && wait <= 6000 && pass === 0) await sleep(wait + 200); else break;
      }
      throw new Error(lastErr || "Groq unavailable");
    };

    let reply = "";
    let usedModel = "";
    for (let step = 0; step < MAX_STEPS; step++) {
      const { msg, model } = await callGroq();
      usedModel = model;
      const calls = msg.tool_calls as any[] | undefined;
      if (!calls?.length) { reply = (msg.content ?? "").trim(); break; }
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const c of calls) {
        let args: any = {};
        try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* empty */ }
        const name = c.function?.name as string;
        const result: any = toolNames.includes(name) ? await run(name, args) : { error: "Tool not available" };
        const ok = !result?.error && result?.success !== false;
        if (!["search_knowledge", "search_web", "check_availability", "list_schedule", "lookup_orders", "get_business_overview"].includes(name)) {
          actions.push({ tool: name, ok, summary: ok ? (result?.booked ? `Booked ${result.booked.title} on ${result.booked.date} at ${result.booked.start_time}` : name === "mark_order_shipped" ? `Marked ${result.customer}'s order as shipped` : name === "save_customer" ? `Saved ${result.saved}` : name === "escalate_to_owner" ? "Flagged for the owner" : name === "apply_owner_rule" ? "Handled with your rule" : name) : (result?.conflict ? "Time slot is taken" : result?.error || "Failed") });
        }
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 2500) });
      }
    }
    if (!reply) reply = mode === "autopilot" ? "" : "I ran into trouble finishing that. Please try again.";
    if (mode === "autopilot") reply = reply.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "").trim();
    // One AI task for the reply, plus one for each action Nexora carried out (booking, saving, escalating...).
    const doneActions = actions.filter((x) => x.ok).length;
    if (usedModel && (reply || doneActions)) await useAiTask(usage, userId, mode === "autopilot" ? "auto_reply" : "reply", (reply ? 1 : 0) + doneActions, false);

    // Sources the answer drew on (cited numbers first; otherwise everything retrieved).
    const cited = new Set<number>();
    for (const m of reply.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)) for (const n of m[1].split(",")) cited.add(Number(n.trim()));
    const sources = passages
      .map((p, i) => ({ n: i + 1, title: p.title, type: p.source_type, category: p.category, item_id: p.item_id, document_id: p.document_id, url: p.source_url || null, snippet: String(p.content).replace(/\s+/g, " ").slice(0, 220), similarity: Math.round((p.similarity || 0) * 100) / 100 }))
      .filter((s) => (cited.size ? cited.has(s.n) : true))
      .slice(0, 6);

    // Learn from this conversation in the background (owner chats only; nexora-learn throttles itself).
    if (!internal && mode === "assistant" && role !== "staff") {
      const learnJob = fetch(`${url}/functions/v1/nexora-learn`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json", "x-internal-owner": userId }, body: JSON.stringify({ action: "run" }) }).catch(() => {});
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(learnJob);
    }

    return json({ success: true, reply, actions, links: links.slice(0, 5), sources, rag: ragOk, escalated, needs_approval: mode === "autopilot" ? !!behavior.askApproval : false, model: usedModel, mode, provider: "groq" });
  } catch (e) {
    console.error("[nexora-agent] unexpected", e);
    const m = String((e as Error)?.message || "");
    const busy = /429|rate limit/i.test(m);
    return json({ success: false, code: busy ? "busy" : "error", message: busy ? "Nexora is very busy right now. Please try again in a few seconds." : "The assistant is unavailable right now." }, busy ? 429 : 502);
  }
});
