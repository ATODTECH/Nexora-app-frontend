import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora daily briefing: "what needs you today", written by AI from the member's own data.
//  POST { action: 'today', tz_offset_min?, refresh? } -> { briefing: { greeting, headline, focus, items[], stats }, cached }
//  POST { action: 'overview' } -> this month's revenue, orders, customers, leads (vs the month before) + recent activity
//  POST { action: 'followups' } -> AI-drafted follow-up messages for quiet leads and past customers worth winning back
// Reads only the member's own rows (their login + database policies). One briefing per member per day is cached.
// Each AI-written briefing or set of follow-ups is one AI task; when the plan's tasks are used up, both are built from the numbers.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GROQ = "https://api.groq.com/openai/v1";
const MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];
const ACTIONS = ["inbox", "attention", "orders", "leads", "followups", "customers", "agenda", "learned", "community", "trends"];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

async function groqJson(key: string, system: string, user: string): Promise<any> {
  for (const model of MODELS) {
    const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3, max_tokens: 900, response_format: { type: "json_object" } };
    if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
    try {
      const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
      if (!res.ok) continue;
      const text = String((await res.json())?.choices?.[0]?.message?.content ?? "");
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch { /* next model */ }
  }
  return null;
}

// Plan limit: each AI reply or action is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("nexora-briefing ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await db.auth.getUser();
    if (!ud?.user) return json({ success: false, message: "Please sign in again." }, 401);
    const me = ud.user.id;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const tz = Math.max(-840, Math.min(840, Number(body?.tz_offset_min) || 60));   // minutes east of UTC; Lagos = 60
    const localNow = new Date(Date.now() + tz * 60000);
    const day = localNow.toISOString().slice(0, 10);
    const hour = localNow.getUTCHours();

    // ---------- Business overview (last 30 days vs the 30 before) + recent activity, for the Home dashboard ----------
    if (body?.action === "overview") {
      const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
      const [o30, o60, custAll, c30, c60, l30, l60, msgs, esc, ordRecent, leadsRecent, learnedRecent, commN] = await Promise.all([
        db.from("orders").select("total,status").gte("created_at", ago(30)).limit(5000),
        db.from("orders").select("total,status").gte("created_at", ago(60)).lt("created_at", ago(30)).limit(5000),
        db.from("customers").select("id", { count: "exact", head: true }).not("segment", "in", "(Lead,Contacted,Qualified,Lost)"),
        db.from("customers").select("id", { count: "exact", head: true }).not("segment", "in", "(Lead,Contacted,Qualified,Lost)").gte("created_at", ago(30)),
        db.from("customers").select("id", { count: "exact", head: true }).not("segment", "in", "(Lead,Contacted,Qualified,Lost)").gte("created_at", ago(60)).lt("created_at", ago(30)),
        db.from("customers").select("id", { count: "exact", head: true }).in("segment", ["Lead", "Contacted", "Qualified"]).gte("created_at", ago(30)),
        db.from("customers").select("id", { count: "exact", head: true }).in("segment", ["Lead", "Contacted", "Qualified"]).gte("created_at", ago(60)).lt("created_at", ago(30)),
        db.from("conversation_messages").select("text,created_at,conversation_id,sender,direction").eq("direction", "out").neq("sender", "owner").order("created_at", { ascending: false }).limit(4),
        db.from("escalations").select("customer_name,reason,created_at,status").order("created_at", { ascending: false }).limit(4),
        db.from("orders").select("customer_name,total,created_at").order("created_at", { ascending: false }).limit(4),
        db.from("customers").select("name,tags,channel,created_at").in("segment", ["Lead", "Contacted", "Qualified"]).order("created_at", { ascending: false }).limit(4),
        db.from("knowledge_items").select("name,created_at").eq("source", "learned").order("created_at", { ascending: false }).limit(3),
        admin.from("community_notifications").select("type,actor_name,snippet,created_at,post_id").eq("user_id", me).order("created_at", { ascending: false }).limit(3),
      ]);
      const ok = (rows: any[] | null) => (rows ?? []).filter((r: any) => r.status !== "cancelled");
      const revenue = (rows: any[] | null) => ok(rows).reduce((a: number, r: any) => a + (Number(r.total) || 0), 0);
      const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
      const overview = {
        revenue: { value: Math.round(revenue(o30.data)), change: pct(revenue(o30.data), revenue(o60.data)) },
        orders: { value: ok(o30.data).length, change: pct(ok(o30.data).length, ok(o60.data).length) },
        customers: { value: custAll.count ?? 0, new: c30.count ?? 0, change: pct(c30.count ?? 0, c60.count ?? 0) },
        leads: { value: l30.count ?? 0, change: pct(l30.count ?? 0, l60.count ?? 0) },
      };
      type Act = { kind: string; title: string; subtitle: string; at: string; tag: string; action: string; post_id?: string };
      const acts: Act[] = [];
      for (const m of msgs.data ?? []) acts.push({ kind: "reply", title: "Customer reply sent", subtitle: clip(m.text, 70), at: m.created_at, tag: "AI Handled", action: "inbox" });
      for (const e of esc.data ?? []) acts.push({ kind: "escalation", title: e.status === "resolved" ? "Decision made" : "Needs your decision", subtitle: `${clip(e.customer_name, 30) || "Customer"} · ${clip(e.reason, 60)}`, at: e.created_at, tag: e.status === "resolved" ? "Done" : "Needs you", action: "attention" });
      for (const o of ordRecent.data ?? []) acts.push({ kind: "order", title: "New order", subtitle: `${clip(o.customer_name, 30) || "Customer"} · ${Math.round(Number(o.total) || 0).toLocaleString()}`, at: o.created_at, tag: "Order", action: "orders" });
      for (const l of leadsRecent.data ?? []) acts.push({ kind: "lead", title: (l.tags ?? []).includes("Shop link") ? "New lead from your shop link" : "New lead", subtitle: `${clip(l.name, 40)}${l.channel ? ` · ${l.channel}` : ""}`, at: l.created_at, tag: "Opportunity", action: "leads" });
      for (const k of learnedRecent.data ?? []) acts.push({ kind: "learned", title: "Nexora learned something new", subtitle: clip(k.name, 60), at: k.created_at, tag: "AI Learned", action: "learned" });
      for (const n of commN.data ?? []) acts.push({ kind: "community", title: n.type === "reply" ? `${clip(n.actor_name, 30)} replied to your post` : n.type === "accepted" ? `${clip(n.actor_name, 30)} picked your answer` : n.type === "upvote" ? `${clip(n.actor_name, 30)} upvoted you` : "Nexora answered your question", subtitle: clip(n.snippet, 60), at: n.created_at, tag: "Community", action: "community", post_id: n.post_id ?? undefined });
      acts.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return json({ success: true, overview, activity: acts.slice(0, 6) });
    }

    // ---------- Smart follow-ups: leads gone quiet and past customers worth winning back ----------
    if (body?.action === "followups") {
      const iso2 = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
      const [prof2, quiet, lapsed, items] = await Promise.all([
        db.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
        db.from("customers").select("id,name,channel,handle,segment,ai_recommendation,last_interaction_at,total_orders").in("segment", ["Lead", "Contacted", "Qualified"]).lt("last_interaction_at", iso2(2)).order("last_interaction_at", { ascending: true }).limit(6),
        db.from("customers").select("id,name,channel,handle,segment,ai_recommendation,last_interaction_at,total_orders,total_spent").gte("total_orders", 1).not("segment", "in", "(Lead,Contacted,Qualified,Lost)").lt("last_interaction_at", iso2(30)).order("total_spent", { ascending: false }).limit(4),
        db.from("knowledge_items").select("name,subtitle,category").in("category", ["products", "services"]).neq("status", "Draft").limit(12),
      ]);
      const people = [...(quiet.data ?? []).map((c: any) => ({ ...c, why: "lead" })), ...(lapsed.data ?? []).map((c: any) => ({ ...c, why: "winback" }))].slice(0, 8);
      if (!people.length) return json({ success: true, followups: [] });
      const days = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
      const facts = people.map((c: any, i: number) => ({
        i, first_name: clip(c.name, 40).split(" ")[0], type: c.why, stage: c.segment, days_since_contact: days(c.last_interaction_at),
        past_orders: c.total_orders ?? 0, note: clip(c.ai_recommendation, 160), channel: c.channel,
      }));
      const key2 = Deno.env.get("GROQ_API_KEY") ?? "";
      let drafts: any = null;
      if (key2 && !(await useAiTask(admin, me, "check"))) {
        drafts = await groqJson(key2,
          `You write short, warm follow-up messages for ${clip(prof2.data?.business_name, 80) || "a small business"} to send on WhatsApp, Instagram or email. ` +
          'Reply as JSON {"messages": [{"i": number, "reason": string (max 70 chars, why follow up now), "message": string (max 280 chars)}]} with one entry per person. ' +
          "Use the person's first name. Leads: check in helpfully, reference what they asked about if a note is given, and end with a simple question. " +
          "Win-back: thank them for past orders, mention something relevant from the catalogue, no pushy discounts unless the note mentions one. " +
          "Sound human, not like a template. No emojis overload (at most one). Never invent prices or offers.",
          JSON.stringify({ catalogue: (items.data ?? []).map((k: any) => `${clip(k.name, 50)}${k.subtitle ? ` (${clip(k.subtitle, 40)})` : ""}`), people: facts }));
        if (drafts) await useAiTask(admin, me, "followups", 1, false);
      }
      const byI = new Map<number, any>((Array.isArray(drafts?.messages) ? drafts.messages : []).map((m: any) => [Number(m.i), m]));
      const followups = people.map((c: any, i: number) => {
        const d = byI.get(i);
        const first = clip(c.name, 40).split(" ")[0];
        return {
          customer_id: c.id, name: c.name, channel: c.channel, handle: c.handle, segment: c.segment, type: c.why,
          days: days(c.last_interaction_at),
          reason: clip(d?.reason, 90) || (c.why === "lead" ? `No reply for ${days(c.last_interaction_at)} days` : `Hasn't ordered in ${days(c.last_interaction_at)} days`),
          message: clip(d?.message, 400) || (c.why === "lead"
            ? `Hi ${first}, just checking in. Do you still need help with what you asked about? I'm happy to answer any questions.`
            : `Hi ${first}, thank you for shopping with us before. We have some new things in stock you might like. Would you like me to share them?`),
        };
      });
      return json({ success: true, followups });
    }

    if (!body?.refresh) {
      const { data: cached, error } = await db.from("daily_briefings").select("content,created_at").eq("user_id", me).eq("day", day).maybeSingle();
      if (error?.code === "42P01") return json({ success: false, code: "setup", message: "The daily briefing isn't set up on the server yet." }, 503);
      // Refresh automatically if the cached one is more than 3 hours old.
      if (cached && Date.now() - new Date(cached.created_at).getTime() < 3 * 3600000) return json({ success: true, briefing: cached.content, cached: true });
    }

    const iso = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
    const [prof, conv, esc, ordOpen, ord7, ord14, leads, atRisk, events, learned, comm, commHelp] = await Promise.all([
      db.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
      db.from("conversations").select("name,channel,unread,last_message,last_message_at").eq("blocked", false).gt("unread", 0).order("last_message_at", { ascending: false }).limit(5),
      db.from("escalations").select("customer_name,reason,urgency,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(5),
      db.from("orders").select("customer_name,items,total,status,created_at").in("status", ["pending", "processing"]).order("created_at").limit(50),
      db.from("orders").select("total").gte("created_at", iso(7)).limit(1000),
      db.from("orders").select("total").gte("created_at", iso(14)).lt("created_at", iso(7)).limit(1000),
      db.from("customers").select("name,channel,segment,created_at").in("segment", ["Lead", "New", "Contacted", "Qualified"]).gte("created_at", iso(7)).order("created_at", { ascending: false }).limit(20),
      db.from("customers").select("name,total_orders,last_interaction_at").gte("total_orders", 1).lt("last_interaction_at", iso(30)).order("total_spent", { ascending: false }).limit(3),
      db.from("schedule_events").select("title,with_whom,start_time,priority,status").eq("event_date", day).order("start_time").limit(10),
      db.from("knowledge_items").select("id", { count: "exact", head: true }).eq("status", "Draft").eq("source", "learned"),
      admin.from("community_notifications").select("id", { count: "exact", head: true }).eq("user_id", me).eq("read", false),
      admin.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "visible").eq("kind", "question").eq("solved", false).gte("created_at", iso(3)).neq("user_id", me),
    ]);
    const sum = (rows: any[] | null) => (rows ?? []).reduce((a, r) => a + (Number(r.total) || 0), 0);
    const open = ordOpen.data ?? [];
    const oldOpen = open.filter((o: any) => Date.now() - new Date(o.created_at).getTime() > 2 * 86400000);
    const stats = {
      unread_chats: (conv.data ?? []).length,
      urgent: (esc.data ?? []).length,
      open_orders: open.length,
      late_orders: oldOpen.length,
      open_order_value: Math.round(sum(open)),
      sales_7d: Math.round(sum(ord7.data)), orders_7d: (ord7.data ?? []).length,
      sales_prev_7d: Math.round(sum(ord14.data)), orders_prev_7d: (ord14.data ?? []).length,
      new_leads_7d: (leads.data ?? []).length,
      win_back: (atRisk.data ?? []).length,
      events_today: (events.data ?? []).length,
      learned_to_review: learned.count ?? 0,
      community_alerts: comm.count ?? 0,
      community_needs_help: commHelp.count ?? 0,
    };
    const name = clip(prof.data?.full_name, 40).split(" ")[0] || "";
    const greeting = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${name ? `, ${name}` : ""}`;

    // Facts the AI may use (no phone numbers or emails are included).
    const facts = {
      business: clip(prof.data?.business_name, 80),
      stats,
      unread_chats: (conv.data ?? []).map((c: any) => ({ name: clip(c.name, 40), channel: c.channel, unread: c.unread, last: clip(c.last_message, 90) })),
      urgent: (esc.data ?? []).map((e: any) => ({ customer: clip(e.customer_name, 40), reason: clip(e.reason, 90), urgency: e.urgency })),
      oldest_open_orders: oldOpen.slice(0, 3).map((o: any) => ({ customer: clip(o.customer_name, 40), items: clip(o.items, 60), days_waiting: Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) })),
      new_leads: (leads.data ?? []).slice(0, 5).map((l: any) => ({ name: clip(l.name, 40), channel: l.channel, stage: l.segment })),
      win_back: (atRisk.data ?? []).map((c: any) => ({ name: clip(c.name, 40), orders: c.total_orders })),
      today_schedule: (events.data ?? []).map((e: any) => ({ title: clip(e.title, 60), with: clip(e.with_whom, 40), time: e.start_time, priority: e.priority })),
    };

    const key = Deno.env.get("GROQ_API_KEY") ?? "";
    let ai: any = null;
    if (key && !(await useAiTask(admin, me, "check"))) {
      ai = await groqJson(key,
        "You are Nexora, a sharp, warm business assistant writing a daily briefing for a small business owner. " +
        'Reply as JSON: {"headline": string (max 90 chars, the single most important thing today), "focus": string (one sentence: what to do first and why), ' +
        `"items": [{"title": string (max 60 chars), "detail": string (max 120 chars, specific: names, counts, amounts), "action": one of ${JSON.stringify(ACTIONS)}, "priority": "high"|"medium"|"low"}]}. ` +
        "Use 2 to 5 items, most important first. Use only the facts given; never invent customers, numbers or events. Sales amounts are in the business's own currency; don't add a currency symbol. " +
        "If sales_7d is higher or lower than sales_prev_7d, mention the change. If quiet leads or win_back customers exist, include a followups item. If there is little to do, say so positively and suggest one growth action (for example reviewing what Nexora learned, checking trends, or helping someone in the community).",
        JSON.stringify(facts));
      if (ai) await useAiTask(admin, me, "briefing", 1, false);
    }
    let items = Array.isArray(ai?.items) ? ai.items.filter((i: any) => i && ACTIONS.includes(i.action)).slice(0, 5).map((i: any) => ({
      title: clip(i.title, 70), detail: clip(i.detail, 140), action: i.action, priority: ["high", "medium", "low"].includes(i.priority) ? i.priority : "medium",
    })).filter((i: any) => i.title) : [];
    // Without AI (or if it returned nothing usable), build the briefing from the numbers.
    if (!items.length) {
      if (stats.urgent) items.push({ title: `${stats.urgent} customer${stats.urgent === 1 ? "" : "s"} need${stats.urgent === 1 ? "s" : ""} your decision`, detail: facts.urgent[0]?.reason || "Nexora flagged these for you.", action: "attention", priority: "high" });
      if (stats.unread_chats) items.push({ title: `${stats.unread_chats} chat${stats.unread_chats === 1 ? "" : "s"} waiting`, detail: facts.unread_chats.map((c: any) => c.name).filter(Boolean).slice(0, 3).join(", "), action: "inbox", priority: "high" });
      if (stats.late_orders) items.push({ title: `${stats.late_orders} order${stats.late_orders === 1 ? "" : "s"} waiting over 2 days`, detail: facts.oldest_open_orders.map((o: any) => o.customer).filter(Boolean).join(", "), action: "orders", priority: "high" });
      if (stats.events_today) items.push({ title: `${stats.events_today} thing${stats.events_today === 1 ? "" : "s"} on your schedule today`, detail: facts.today_schedule.map((e: any) => `${e.time || ""} ${e.title}`.trim()).slice(0, 3).join(" · "), action: "agenda", priority: "medium" });
      if (stats.new_leads_7d) items.push({ title: `${stats.new_leads_7d} new lead${stats.new_leads_7d === 1 ? "" : "s"} this week`, detail: "Follow up while they're interested.", action: "leads", priority: "medium" });
      if (stats.win_back) items.push({ title: `${stats.win_back} past customer${stats.win_back === 1 ? "" : "s"} to win back`, detail: facts.win_back.map((c: any) => c.name).filter(Boolean).join(", "), action: "followups", priority: "medium" });
      if (stats.learned_to_review) items.push({ title: `Nexora learned ${stats.learned_to_review} new fact${stats.learned_to_review === 1 ? "" : "s"}`, detail: "Confirm them so Nexora answers customers correctly.", action: "learned", priority: "low" });
      if (!items.length) items.push({ title: "All caught up", detail: stats.community_needs_help ? `${stats.community_needs_help} business owners asked questions in the Community. Your experience could help.` : "A good day to check what's trending for your business.", action: stats.community_needs_help ? "community" : "trends", priority: "low" });
      items = items.slice(0, 5);
    }
    const briefing = {
      day, greeting,
      headline: clip(ai?.headline, 100) || items[0]?.title || "Here's your day",
      focus: clip(ai?.focus, 220) || (items[0] ? `Start with: ${items[0].title.toLowerCase()}.` : ""),
      items, stats, generated_at: new Date().toISOString(), ai: !!ai,
    };
    await admin.from("daily_briefings").upsert({ user_id: me, day, content: briefing, created_at: new Date().toISOString() });
    return json({ success: true, briefing, cached: false });
  } catch (e) {
    console.error("nexora-briefing", e instanceof Error ? e.message : String(e));
    return json({ success: false, message: "Couldn't prepare your briefing. Please try again." }, 500);
  }
});
