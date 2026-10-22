import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora learn: turns the owner's Brain chats and inbox conversations into knowledge.
//  POST { action: 'run' }                         -> read new chats since last time, learn, index (owner only)
//  POST { action: 'list' }                        -> learned / researched items waiting for review
//  POST { action: 'approve', item_id, name?, content? } -> confirm (Verified), optionally edited
//  POST { action: 'dismiss', item_id }            -> delete a learned item
//  POST { action: 'settings', enabled }           -> turn automatic learning on or off
//  POST { action: 'status' }                      -> counts + last run
// Trust rules: only what the OWNER says (Brain, or replies the owner typed in the inbox) becomes a fact that
// Nexora uses at once (status "Need review"). Customer questions become FAQ drafts that are NOT used until the
// owner approves them. Customer names, phone numbers and emails are never stored as knowledge.
// Called by the signed-in owner, or by nexora-agent with the service key + x-internal-owner.
// Each learning run that calls the AI is one AI task on the business's plan; runs are skipped when the tasks are used up.
declare const Supabase: any;
declare const EdgeRuntime: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-internal-owner",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GROQ = "https://api.groq.com/openai/v1";
const MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3-32b"];
const MIN_GAP_MS = 3 * 60_000;          // don't re-run more often than this
const DUPLICATE_SIMILARITY = 0.9;       // gte-small: above this, it's already known
const CATEGORIES = ["products", "services", "policies", "faqs", "operations"];
const ICONS: Record<string, [string, string, string]> = {
  products: ["cube-outline", "#EAF1FB", "#1E56A0"], services: ["construct-outline", "#E2F5F3", "#0F766E"],
  policies: ["document-text-outline", "#FDEDED", "#D64545"], faqs: ["help-circle-outline", "#EEF1F4", "#5C6B7A"],
  operations: ["time-outline", "#E2F5F3", "#0F766E"],
};

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey);
let embedder: any = null;
async function embed(text: string): Promise<number[] | null> {
  try {
    if (!embedder) embedder = new Supabase.ai.Session("gte-small");
    return Array.from((await embedder.run(text.slice(0, 1500), { mean_pool: true, normalize: true })) as ArrayLike<number>);
  } catch { return null; }
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
// Remove personal details before anything is stored.
const scrub = (t: string) => t
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
  .replace(/\+?\d[\d\s()-]{7,}\d/g, "[phone]");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Plan limit: each AI reply or action is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("[nexora-learn] ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

async function groqJson(key: string, system: string, user: string): Promise<any> {
  let last = "";
  for (const model of MODELS) {
    const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: 1800, response_format: { type: "json_object" } };
    if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
    try {
      const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
      const raw = await res.text();
      if (!res.ok) { last = `${model} ${res.status}`; continue; }
      const text = String(JSON.parse(raw)?.choices?.[0]?.message?.content ?? "");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch (e) { last = String(e); }
  }
  throw new Error(`learning model unavailable (${last})`);
}

function kick(owner: string) {
  const job = fetch(`${url}/functions/v1/rag-index`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json", "x-internal-owner": owner }, body: JSON.stringify({ action: "embed" }) }).catch(() => {});
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
}

async function learn(owner: string, key: string, force: boolean) {
  const { data: st0 } = await admin.from("learning_state").select("*").eq("user_id", owner).maybeSingle();
  let st = st0;
  if (!st) { const ins = await admin.from("learning_state").insert({ user_id: owner }).select("*").single(); st = ins.data; }
  if (!st?.enabled) return { learned: 0, skipped: "Learning is turned off." };
  if (!force && st.last_run_at && Date.now() - new Date(st.last_run_at).getTime() < MIN_GAP_MS) return { learned: 0, skipped: "Ran recently." };
  await admin.from("learning_state").update({ last_run_at: new Date().toISOString() }).eq("user_id", owner);

  const [chatR, inboxR, itemsR, bizR] = await Promise.all([
    admin.from("chat_messages").select("role,text,created_at").eq("user_id", owner).gt("created_at", st.chats_until).order("created_at").limit(80),
    admin.from("conversation_messages").select("direction,sender,text,created_at").eq("user_id", owner).gt("created_at", st.inbox_until).order("created_at").limit(150),
    admin.from("knowledge_items").select("name,category").eq("user_id", owner).limit(400),
    admin.from("businesses").select("name,industry,country").eq("owner_id", owner).maybeSingle(),
  ]);
  const chats = (chatR.data ?? []) as any[];
  const inbox = (inboxR.data ?? []) as any[];
  if (!chats.length && !inbox.length) return { learned: 0, skipped: "Nothing new to learn from." };
  // Not marked as read, so these chats are learned from once the business has AI tasks again.
  const quota = await useAiTask(owner, "check");
  if (quota) return { learned: 0, skipped: quota };

  const chatText = chats.map((m) => `[${m.role === "user" ? "OWNER" : "NEXORA"} ${day(m.created_at)}] ${scrub(clip(m.text, 600))}`).join("\n").slice(0, 9000);
  const inboxText = inbox.map((m) => `[${m.direction === "in" ? "CUSTOMER" : m.sender === "owner" ? "OWNER" : "NEXORA"} ${day(m.created_at)}] ${scrub(clip(m.text, 400))}`).join("\n").slice(0, 9000);
  const known = (itemsR.data ?? []).map((i: any) => `${i.category}: ${i.name}`).join("; ").slice(0, 3000);
  const biz = bizR.data ? `${bizR.data.name}${bizR.data.industry ? ` (${bizR.data.industry})` : ""}${bizR.data.country ? `, ${bizR.data.country}` : ""}` : "a small business";

  const system = `You maintain the knowledge base of ${biz}. Extract DURABLE business knowledge from the conversations.
Return ONLY JSON: {"items":[{"kind":"fact"|"faq","category":"products"|"services"|"policies"|"faqs"|"operations","name":string,"content":string,"answer":string,"evidence":string,"confidence":number}]}
Rules:
- "fact": something the OWNER stated about the business (prices, stock, products, services, opening hours, delivery, payment, policies, suppliers, staff duties, processes). Never from CUSTOMER or NEXORA lines alone.
- "faq": a question CUSTOMERS ask (repeatedly, or that NEXORA could not answer). Put the OWNER's answer in "answer" if the owner answered it, otherwise "".
- Skip greetings, one-off order details, individual customer names or contacts, complaints about one order, and anything already listed under KNOWN ITEMS unless the owner CHANGED it (then describe the change and say "Updated:" at the start of content).
- name <= 80 chars (a product name, policy name or the question). content <= 400 chars, self-contained, plain facts. evidence <= 160 chars quoting the line it came from.
- confidence 0..1. At most 8 items. Return {"items":[]} if nothing qualifies.`;
  const user = `KNOWN ITEMS: ${known || "(none)"}\n\nBRAIN CHATS (owner with Nexora):\n${chatText || "(none)"}\n\nINBOX CONVERSATIONS:\n${inboxText || "(none)"}`;
  const out = await groqJson(key, system, user);
  await useAiTask(owner, "learning", 1, false);

  let learned = 0;
  for (const it of (Array.isArray(out?.items) ? out.items : []).slice(0, 8)) {
    const kind = it?.kind === "faq" ? "faq" : "fact";
    const category = CATEGORIES.includes(it?.category) ? it.category : kind === "faq" ? "faqs" : "operations";
    const name = scrub(clip(it?.name, 120));
    const content = scrub(clip(it?.content, 500));
    const answer = scrub(clip(it?.answer, 500));
    if (!name || (!content && !answer) || Number(it?.confidence ?? 0) < 0.6) continue;
    // Already known? (same name, or a passage that says the same thing)
    const same = await admin.from("knowledge_items").select("id").eq("user_id", owner).ilike("name", name.replace(/[%_]/g, "")).limit(1);
    if (same.data?.length) continue;
    const v = await embed(`${name}\n${content} ${answer}`);
    if (v) {
      const { data: hit } = await admin.rpc("match_knowledge", { p_user: owner, query_embedding: JSON.stringify(v), query_text: name, match_count: 1 });
      if (hit?.[0] && Number(hit[0].similarity) >= DUPLICATE_SIMILARITY && !content.startsWith("Updated:")) continue;
    }
    // Owner facts and owner-answered FAQs are used straight away; unanswered customer questions wait as drafts.
    const usable = kind === "fact" || !!answer;
    const [icon, bg, fg] = ICONS[category];
    const fields = kind === "faq"
      ? [{ label: "Answer", value: answer || "(add the answer)" }, { label: "Status", value: usable ? "Need review" : "Draft" }]
      : [{ label: "Learned", value: content }, { label: "Status", value: "Need review" }];
    const { error } = await admin.from("knowledge_items").insert({
      user_id: owner, category, name, subtitle: kind === "faq" ? (answer ? "Learned answer" : "Customers ask this") : "Learned from chats",
      status: usable ? "Need review" : "Draft", overview: kind === "faq" ? (answer || content) : content, fields, features: [],
      icon, icon_bg: bg, icon_color: fg, source: "learned", source_detail: scrub(clip(it?.evidence, 200)),
    });
    if (!error) learned++;
  }
  const chatsUntil = chats.length ? chats[chats.length - 1].created_at : st.chats_until;
  const inboxUntil = inbox.length ? inbox[inbox.length - 1].created_at : st.inbox_until;
  await admin.from("learning_state").update({ chats_until: chatsUntil, inbox_until: inboxUntil, learned_total: (st.learned_total ?? 0) + learned }).eq("user_id", owner);
  if (learned) kick(owner);
  return { learned, read: { chats: chats.length, inbox: inbox.length } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ success: false, message: "The AI service isn't configured yet." }, 503);
    const authHeader = req.headers.get("Authorization") ?? "";
    const ownerHdr = req.headers.get("x-internal-owner") ?? "";
    let owner = "";
    if (authHeader === `Bearer ${serviceKey}` && /^[0-9a-f-]{36}$/i.test(ownerHdr)) {
      owner = ownerHdr;
    } else {
      const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data } = await asUser.auth.getUser();
      if (!data?.user) return json({ success: false, message: "Please sign in again." }, 401);
      // Only the business owner (or a solo user with no company yet) teaches Nexora; staff can't.
      const { data: m } = await admin.from("business_members").select("role").eq("user_id", data.user.id).eq("status", "active").maybeSingle();
      if (m && m.role !== "owner") return json({ success: false, code: "owner_only", message: "Only the business owner can manage what Nexora learns." }, 403);
      owner = data.user.id;
    }
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "run";

    if (action === "run") return json({ success: true, ...(await learn(owner, key, body?.force === true)) });

    if (action === "list") {
      const { data } = await admin.from("knowledge_items")
        .select("id,category,name,subtitle,status,overview,fields,source,source_detail,created_at")
        .eq("user_id", owner).in("source", ["learned", "web"]).neq("status", "Verified")
        .order("created_at", { ascending: false }).limit(60);
      return json({ success: true, items: data ?? [] });
    }

    if (action === "approve" || action === "dismiss") {
      const id = typeof body?.item_id === "string" ? body.item_id : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, message: "Missing item." }, 400);
      const { data: item } = await admin.from("knowledge_items").select("id,category,name,overview,fields").eq("id", id).eq("user_id", owner).maybeSingle();
      if (!item) return json({ success: false, message: "That item no longer exists." }, 404);
      if (action === "dismiss") {
        await admin.from("knowledge_items").delete().eq("id", id);
        return json({ success: true });
      }
      const name = clip(body?.name, 120) || item.name;
      const content = clip(body?.content, 800) || item.overview;
      const fields = item.category === "faqs"
        ? [{ label: "Answer", value: content }, { label: "Status", value: "Verified" }]
        : [{ label: "Details", value: content }, { label: "Status", value: "Verified" }];
      const { error } = await admin.from("knowledge_items").update({ name, overview: content, fields, status: "Verified" }).eq("id", id);
      if (error) return json({ success: false, message: "Couldn't save that." }, 500);
      kick(owner);
      return json({ success: true });
    }

    if (action === "settings") {
      await admin.from("learning_state").upsert({ user_id: owner, enabled: body?.enabled !== false }, { onConflict: "user_id" });
      return json({ success: true, enabled: body?.enabled !== false });
    }

    if (action === "status") {
      const head = { count: "exact" as const, head: true };
      const [st, waiting, learnedAll, web] = await Promise.all([
        admin.from("learning_state").select("enabled,last_run_at,learned_total,researched_at").eq("user_id", owner).maybeSingle(),
        admin.from("knowledge_items").select("id", head).eq("user_id", owner).in("source", ["learned", "web"]).neq("status", "Verified"),
        admin.from("knowledge_items").select("id", head).eq("user_id", owner).eq("source", "learned"),
        admin.from("knowledge_chunks").select("id", head).eq("user_id", owner).eq("source_type", "web").gt("expires_at", new Date().toISOString()),
      ]);
      return json({ success: true, enabled: st.data?.enabled ?? true, last_run_at: st.data?.last_run_at ?? null, researched_at: st.data?.researched_at ?? null,
        learned_total: learnedAll.count ?? 0, waiting_review: waiting.count ?? 0, web_passages: web.count ?? 0 });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("[nexora-learn]", e);
    return json({ success: false, message: (e as Error)?.message || "Learning failed." }, 500);
  }
});
