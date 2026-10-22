import { createClient } from "jsr:@supabase/supabase-js@2";

// "Decide once": the owner decides, Nexora carries it out and learns it.
//  POST { action: 'draft', escalation_id, decision }          -> message Nexora would send the customer (+ where it would go)
//  POST { action: 'send',  escalation_id, decision, message } -> sends it on the customer's channel, closes the escalation,
//                                                                and returns a suggested rule
//  POST { action: 'close', escalation_id, decision }          -> records the decision without messaging (e.g. you called them)
//  POST { action: 'suggest_rule', escalation_id, decision }   -> a rule suggestion on its own
//  POST { action: 'save_rule', situation, action_text, limits?, source_escalation_id? }
//  POST { action: 'autonomy' }                                -> how much Nexora handled without you (7 days vs the 7 before)
// Uses GROQ_API_KEY (already set). Sending uses the channel tokens saved by channel-connect.
// Each AI draft or rule suggestion is one AI task on the business's plan.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}`;
const MODELS = (Deno.env.get("GROQ_DECIDE_MODELS") || "openai/gpt-oss-120b,llama-3.3-70b-versatile,openai/gpt-oss-20b,llama-3.1-8b-instant").split(",").map((s) => s.trim()).filter(Boolean);
const DAY = 86400000;

async function groqJson(system: string, user: string): Promise<any | null> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return null;
  for (const model of MODELS) {
    try {
      const payload: Record<string, unknown> = { model, temperature: 0.3, max_tokens: 600, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
      if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { console.error("[nexora-decide] groq", model, r.status, (await r.text()).slice(0, 160)); continue; }
      const txt = (await r.json())?.choices?.[0]?.message?.content ?? "";
      return JSON.parse(txt);
    } catch (e) { console.error("[nexora-decide] groq parse", model, e); }
  }
  return null;
}

// Plan limit: each AI reply or action is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("[nexora-decide] ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

async function graphSend(channel: string, sec: { external_id: string; access_token: string }, to: string, text: string) {
  const body = channel === "whatsapp"
    ? { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }
    : { recipient: { id: to }, messaging_type: "RESPONSE", message: { text: text.slice(0, 1900) } };
  const res = await fetch(`${GRAPH}/${sec.external_id}/messages`, { method: "POST", headers: { Authorization: `Bearer ${sec.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j?.error?.message || `HTTP ${res.status}`, code: j?.error?.code };
  return { ok: true, id: j?.messages?.[0]?.id || j?.message_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud?.user) return json({ success: false, message: "Please sign in again." }, 401);
    const me = ud.user.id;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    // AI only while the business has AI tasks left this month (otherwise the callers fall back to no AI).
    const aiJson = async (kind: string, system: string, user: string) => {
      if (await useAiTask(admin, me, "check")) return null;
      const out = await groqJson(system, user);
      if (out) await useAiTask(admin, me, kind, 1, false);
      return out;
    };

    const [{ data: biz }, { data: prof }] = await Promise.all([
      admin.from("businesses").select("name,industry").eq("owner_id", me).maybeSingle(),
      admin.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
    ]);
    const business = biz?.name || prof?.business_name || "our business";
    const owner = String(prof?.full_name || "").split(" ")[0] || "the owner";

    if (action === "autonomy") {
      const now = Date.now();
      const since = new Date(now - 14 * DAY).toISOString();
      const [msgR, escR, ruleR] = await Promise.all([
        admin.from("conversation_messages").select("conversation_id,direction,sender,created_at").eq("user_id", me).gte("created_at", since).limit(5000),
        admin.from("escalations").select("id,conversation_id,customer_name,channel,handled_by,status,created_at").eq("user_id", me).gte("created_at", since).limit(2000),
        admin.from("owner_rules").select("id,enabled,uses").eq("user_id", me),
      ]);
      if (escR.error?.code === "42703" || ruleR.error?.code === "42P01") return json({ success: false, code: "not_set_up", message: "Run nexora-owner-calls.sql in Supabase first." }, 503);
      const week = (from: number, to: number) => {
        const inW = (t: string) => { const x = new Date(t).getTime(); return x >= now - from * DAY && x < now - to * DAY; };
        const msgs = (msgR.data ?? []).filter((m: any) => inW(m.created_at));
        const chats = new Set(msgs.filter((m: any) => m.direction === "in").map((m: any) => m.conversation_id));
        const aiReplies = msgs.filter((m: any) => m.direction === "out" && m.sender === "ai").length;
        const esc = (escR.data ?? []).filter((e: any) => inW(e.created_at));
        const needed = esc.filter((e: any) => e.handled_by !== "rule");
        const byRule = esc.filter((e: any) => e.handled_by === "rule").length;
        // A chat "needed you" if it was escalated to you (website leads count as chats too).
        const neededKeys = new Set(needed.map((e: any) => e.conversation_id || `${e.customer_name}|${e.channel}`));
        const total = Math.max(chats.size, neededKeys.size);
        const handled = Math.max(0, total - neededKeys.size);
        return { chats: total, handled, needed_you: neededKeys.size, ai_replies: aiReplies, by_rule: byRule, rate: total ? Math.round((handled / total) * 100) : null };
      };
      const cur = week(7, 0), prev = week(14, 7);
      const rules = ruleR.data ?? [];
      return json({
        success: true, ...cur, prev_rate: prev.rate, prev_chats: prev.chats,
        // ~2 minutes per message Nexora wrote, ~10 minutes per decision a rule made for you
        minutes_saved: cur.ai_replies * 2 + cur.by_rule * 10,
        rules_total: rules.length, rules_on: rules.filter((r: any) => r.enabled).length,
      });
    }

    if (action === "save_rule") {
      const situation = clip(body.situation, 300), act = clip(body.action_text, 400), limits = clip(body.limits, 300);
      if (situation.length < 3 || act.length < 3) return json({ success: false, message: "Describe the situation and what Nexora should do." }, 400);
      let src: any = null;
      if (typeof body.source_escalation_id === "string" && /^[0-9a-f-]{36}$/i.test(body.source_escalation_id)) {
        const { data } = await admin.from("escalations").select("id,user_id,customer_name").eq("id", body.source_escalation_id).maybeSingle();
        if (data?.user_id === me) src = data;
      }
      const { count } = await admin.from("owner_rules").select("id", { count: "exact", head: true }).eq("user_id", me);
      if ((count ?? 0) >= 100) return json({ success: false, message: "You have 100 rules. Remove some before adding more." }, 400);
      const { data, error } = await admin.from("owner_rules").insert({ user_id: me, situation, action: act, limits: limits || null, source_escalation_id: src?.id ?? null, source_customer: src?.customer_name ?? null }).select("*").single();
      // P0001 = the plan's active automation limit (the message says what to do)
      if (error?.code === "P0001") return json({ success: false, code: "plan_limit", message: error.message }, 403);
      if (error) throw error;
      return json({ success: true, rule: data });
    }

    // Everything below works on one escalation of yours.
    const id = String(body.escalation_id ?? "");
    const { data: esc, error: eErr } = await admin.from("escalations").select("*").eq("id", id).maybeSingle();
    if (eErr?.code === "42703") return json({ success: false, code: "not_set_up", message: "Run nexora-owner-calls.sql in Supabase first." }, 503);
    if (!esc || esc.user_id !== me) return json({ success: false, message: "Not found." }, 404);
    const decision = clip(body.decision, 600);

    // Find the chat this came from.
    let conv: any = null;
    if (esc.conversation_id) conv = (await admin.from("conversations").select("id,channel,external_id,name,blocked").eq("id", esc.conversation_id).maybeSingle()).data;
    if (!conv && esc.customer_name) {
      let q = admin.from("conversations").select("id,channel,external_id,name,blocked").eq("user_id", me).eq("name", esc.customer_name).order("last_message_at", { ascending: false }).limit(1);
      if (esc.channel) q = q.ilike("channel", esc.channel);
      conv = (await q).data?.[0] ?? null;
    }
    const sendable = !!conv && !conv.blocked && ["whatsapp", "instagram", "facebook"].includes(conv.channel);
    const where = conv ? `${conv.name} on ${conv.channel.charAt(0).toUpperCase()}${conv.channel.slice(1)}` : esc.customer_name || "the customer";

    const suggestRule = async () => {
      const r = await aiJson("rule_suggestion",
        `You turn a business owner's one-off decision into a reusable rule for their AI assistant. Return JSON {"situation": string, "action": string, "limits": string, "worth_it": boolean}.
- situation: when this applies, general enough to cover similar customers (no names), max 18 words, starts with "When".
- action: what the assistant should do, max 25 words, in the owner's intent.
- limits: a safety limit implied by the decision (an amount, a count, a time window) or "" if none. Never broaden beyond what the owner decided.
- worth_it: false if the decision was clearly a one-off (personal, unique, or just "I'll call them").`,
        `Business: ${business}. Escalation: ${esc.reason}. Customer channel: ${esc.channel || "unknown"}. Owner decided: ${decision || "(no text)"}`);
      if (!r || r.worth_it === false || !r.situation || !r.action) return null;
      return { situation: clip(r.situation, 300), action: clip(r.action, 400), limits: clip(r.limits, 300) };
    };

    if (action === "suggest_rule") return json({ success: true, rule: decision ? await suggestRule() : null });

    if (action === "draft") {
      if (!decision) return json({ success: false, message: "Tell Nexora what you decided." }, 400);
      let history = "";
      if (conv) {
        const { data: h } = await admin.from("conversation_messages").select("sender,text").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(8);
        history = (h ?? []).reverse().map((m: any) => `${m.sender === "customer" ? "Customer" : "Business"}: ${clip(m.text, 300)}`).join("\n");
      }
      const r = await aiJson("draft",
        `You write one short message from ${business} to a customer, carrying out the owner's decision. Return JSON {"message": string}. Friendly, clear, max 3 sentences, plain text, no markdown, no signature, same language the customer used. Say exactly what was decided; never add promises, amounts or dates the owner didn't state. Don't mention AI or escalations.`,
        `Why the customer needed the owner: ${esc.reason}\nOwner's decision: ${decision}\n${history ? `Recent chat:\n${history}` : ""}`);
      const message = clip(r?.message, 1500) || decision;
      return json({ success: true, message, sendable, to: where, channel: conv?.channel ?? null, reason: sendable ? "" : conv?.blocked ? "You blocked this contact." : conv ? "This channel can't be messaged from Nexora yet." : "Nexora can't find this customer's chat (for example a lead from your shop link). Contact them yourself; Nexora will still save your decision." });
    }

    if (action === "send" || action === "close") {
      let sentOk = false;
      if (action === "send") {
        const message = clip(body.message, 1500);
        if (!message) return json({ success: false, message: "Nothing to send." }, 400);
        if (!sendable) return json({ success: false, message: "Nexora can't message this customer. Use 'Save decision' instead." }, 400);
        const { data: sec } = await admin.from("channel_secrets").select("external_id,access_token").eq("user_id", me).eq("channel", conv.channel).maybeSingle();
        if (!sec) return json({ success: false, message: `Reconnect ${conv.channel} in Connected channels to send messages.` }, 409);
        const sent = await graphSend(conv.channel, sec, conv.external_id, message);
        if (!sent.ok) {
          const windowClosed = sent.code === 131047 || sent.code === 10 || /24 hour|outside of allowed window|re-engage/i.test(sent.error || "");
          return json({ success: false, message: windowClosed ? "The 24-hour reply window for this customer has closed. They need to message you first." : "The platform didn't accept that message. Please try again." }, 502);
        }
        await admin.from("conversation_messages").insert({ conversation_id: conv.id, user_id: me, direction: "out", sender: "ai", text: message, external_id: sent.id ?? null });
        await admin.from("conversations").update({ last_message: message.slice(0, 200), last_message_at: new Date().toISOString(), unread: 0, ai_suggestion: null, status: "AI can handle" }).eq("id", conv.id);
        sentOk = true;
      }
      const { error: uErr } = await admin.from("escalations").update({ status: "resolved", decision: decision || null, decided_at: new Date().toISOString(), handled_by: "owner", ...(conv && !esc.conversation_id ? { conversation_id: conv.id } : {}) }).eq("id", esc.id);
      if (uErr) {   // database script not run yet: still close it
        console.error("[nexora-decide] update", uErr.message);
        await admin.from("escalations").update({ status: "resolved" }).eq("id", esc.id);
      }
      await admin.from("owner_alerts").upsert({ escalation_id: esc.id, user_id: me, acknowledged_at: new Date().toISOString(), response: decision || "Decided in the app", last_status: "answered" }, { onConflict: "escalation_id" }).then(() => {}, () => {});
      // Nexora offers a rule unless the decision was clearly a one-off; it is only saved if you approve it.
      const rule = decision ? await suggestRule() : null;
      return json({ success: true, sent: sentOk, to: where, rule });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("[nexora-decide]", e);
    return json({ success: false, message: "Something went wrong. Please try again." }, 500);
  }
});
