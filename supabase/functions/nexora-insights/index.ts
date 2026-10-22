import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora Business Insights: a dashboard of charts made from the member's own orders, customers, chats and AI shop
// link, plus an AI analysis and profitable ideas (with pictures) made for their business. Open to every plan, Free included.
//  POST { action: 'insights', tz_offset_min?, refresh? }
// Reads the member's rows with their own login (database policies apply). Pictures come from Wikimedia Commons or the
// member's own product photos. Function secret: GROQ_API_KEY (without it the charts still work, without the AI text).
// The AI analysis is one AI task on the business's plan; when the plan's tasks are used up the charts still work.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GROQ = "https://api.groq.com/openai/v1";
const MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

async function groqJson(key: string, system: string, user: string, maxTokens = 900): Promise<any> {
  for (const model of MODELS) {
    const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.4, max_tokens: maxTokens, response_format: { type: "json_object" } };
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
  if (error) { console.error("nexora-insights ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

// ---------- Business Insights helpers ----------
const CURRENCY: Record<string, string> = { nigeria: "NGN", ghana: "GHS", kenya: "KES", "south africa": "ZAR", egypt: "EGP", "united states": "USD", usa: "USD", "united kingdom": "GBP", uk: "GBP", canada: "CAD", rwanda: "RWF", uganda: "UGX", tanzania: "TZS", cameroon: "XAF", senegal: "XOF", "côte d'ivoire": "XOF", "cote d'ivoire": "XOF", india: "INR", "united arab emirates": "AED", germany: "EUR", france: "EUR", ireland: "EUR", netherlands: "EUR", spain: "EUR", italy: "EUR" };
const insightsCache = new Map<string, { at: number; sig: string; ai: any; images: Record<string, string>; hero: string }>();
// A real photo for an idea, from Wikimedia Commons (free to reuse; credited in the app).
async function commonsImage(q: string): Promise<string> {
  const query = clip(q, 60);
  if (!query) return "";
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=720&origin=*`;
    const r = await fetch(u, { headers: { "User-Agent": "NexoraAI/1.0 (Nexora business insights; ATOD Tech, Lagos)" }, signal: AbortSignal.timeout(4500) });
    if (!r.ok) return "";
    const pages = Object.values((await r.json())?.query?.pages ?? {}) as any[];
    pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    for (const p of pages) {
      const ii = p?.imageinfo?.[0];
      if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || "")) continue;
      if ((ii.width ?? 0) < 500 || (ii.height ?? 0) < 300 || ii.height > ii.width * 1.6) continue;   // skip tiny and very tall images
      if (/logo|icon|map|flag|diagram|chart|coat.of.arms|signature/i.test(String(p.title))) continue;
      const t = String(ii.thumburl || ii.url || "");
      if (/^https:\/\/upload\.wikimedia\.org\//.test(t)) return t;
    }
  } catch { /* slow or offline: no picture */ }
  return "";
}
function parseItems(text: string): { name: string; qty: number }[] {
  return String(text || "").split(/[,;\n]/).map((part) => {
    const m = /^\s*(?:(\d+)\s*[x×]\s*)?(.*?)\s*(?:[x×]\s*(\d+))?\s*$/i.exec(part);
    const name = clip(m?.[2] ?? "", 60);
    return { name, qty: Math.max(1, Math.min(999, Number(m?.[3] || m?.[1] || 1))) };
  }).filter((x) => x.name.length > 1);
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

    // ---------- Business Insights: a chart dashboard of the member's own business + AI ideas ----------
    if (!body?.action || body.action === "insights") {
      const DAY = 86400000;
      const agoI = (d: number) => new Date(Date.now() - d * DAY).toISOString();
      const [profI, bizI, ordI, custI, convI, catI, trendI, hitsI] = await Promise.all([
        db.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
        db.rpc("my_workspace"),   // the member's company (as owner or staff)
        db.from("orders").select("items,total,status,created_at,customer_name").gte("created_at", agoI(182)).order("created_at", { ascending: true }).limit(5000),
        db.from("customers").select("name,segment,channel,location,created_at").limit(5000),
        db.from("conversations").select("channel,created_at,last_message_at").limit(5000),
        db.from("knowledge_items").select("name,subtitle,image_url,category,fields").in("category", ["products", "services"]).neq("status", "Draft").limit(80),
        db.from("trend_snapshots").select("data,fetched_at").eq("user_id", me).maybeSingle(),
        admin.from("storefront_hits").select("kind,created_at").eq("store_user_id", me).gte("created_at", agoI(30)).limit(5000),
      ]);
      const ws = (Array.isArray(bizI.data) ? bizI.data[0] : bizI.data) ?? null;
      // No company yet: nothing to analyse. Ask the member to register their business first (no AI call).
      if (!ws) {
        return json({ success: true, data: { business: { has_business: false, name: clip(profI.data?.business_name, 80), industry: "", country: "", currency: "", plan: null, status: null } }, summary: "", insights: [], ideas: [], hero: "", ai: false, generated_at: new Date().toISOString() });
      }
      const country = clip(ws.country, 40);
      const currency = CURRENCY[country.toLowerCase()] ?? "";
      const businessName = clip(ws.name, 80) || clip(profI.data?.business_name, 80);
      const industry = clip(ws.industry, 80);
      const local = (iso: string) => new Date(new Date(iso).getTime() + tz * 60000);
      const dayKey = (d: Date) => d.toISOString().slice(0, 10);
      const todayLocal = new Date(Date.now() + tz * 60000);
      const allOrders = (ordI.data ?? []) as any[];
      const valid = allOrders.filter((o) => o.status !== "cancelled");
      const amt = (o: any) => Number(o.total) || 0;
      const sumOf = (l: any[]) => l.reduce((a, o) => a + amt(o), 0);
      const inLast = (o: any, from: number, to = 0) => { const t = Date.now() - new Date(o.created_at).getTime(); return t < from * DAY && t >= to * DAY; };
      const pctI = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

      // One list of the people who buy, built from real orders plus saved customers (typed-in totals are ignored,
      // because they often don't match the orders). Keyed by name, as orders only carry the customer's name.
      const custRows = (custI.data ?? []) as any[];
      const leadSegs = ["Lead", "Contacted", "Qualified"];
      const nameKey = (t: unknown) => String(t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const roster = new Map<string, { name: string; first: number; orders: number; spent: number; segment: string; saved: boolean }>();
      for (const o of valid) {
        const k = nameKey(o.customer_name); if (!k) continue;
        const t = new Date(o.created_at).getTime();
        const v = roster.get(k) ?? { name: clip(o.customer_name, 60), first: t, orders: 0, spent: 0, segment: "", saved: false };
        v.orders += 1; v.spent += amt(o); v.first = Math.min(v.first, t); roster.set(k, v);
      }
      for (const c of custRows) {
        const k = nameKey(c.name); if (!k) continue;
        const v = roster.get(k);
        if (v) { v.segment = c.segment || ""; v.saved = true; v.first = Math.min(v.first, new Date(c.created_at).getTime()); }
        else roster.set(k, { name: clip(c.name, 60), first: new Date(c.created_at).getTime(), orders: 0, spent: 0, segment: c.segment || "", saved: true });
      }
      const people = [...roster.values()];
      // A customer has ordered, or is saved as a customer (not a lead / lost contact).
      const isBuyer = (p: { orders: number; segment: string }) => p.orders > 0 || (!!p.segment && !leadSegs.includes(p.segment) && p.segment !== "Lost");
      const firstSeenIn = (from: number, to = 0) => (p: { first: number }) => { const a = Date.now() - p.first; return a < from * DAY && a >= to * DAY; };

      // Daily revenue: the last 30 days, and the 30 days before (same position) for comparison.
      const daily: { day: string; revenue: number; orders: number; prev: number }[] = [];
      const byDay = new Map<string, { r: number; n: number }>();
      for (const o of valid) { const k = dayKey(local(o.created_at)); const v = byDay.get(k) ?? { r: 0, n: 0 }; v.r += amt(o); v.n += 1; byDay.set(k, v); }
      for (let i = 29; i >= 0; i--) {
        const d = new Date(todayLocal.getTime() - i * DAY), p = new Date(todayLocal.getTime() - (i + 30) * DAY);
        daily.push({ day: dayKey(d), revenue: Math.round(byDay.get(dayKey(d))?.r ?? 0), orders: byDay.get(dayKey(d))?.n ?? 0, prev: Math.round(byDay.get(dayKey(p))?.r ?? 0) });
      }
      // Weekly revenue and new customers for 12 weeks, plus a 4-week forecast (straight-line trend).
      const weekly: { start: string; revenue: number; orders: number; new_customers: number }[] = [];
      for (let w = 11; w >= 0; w--) {
        const from = (w + 1) * 7, to = w * 7;
        const wk = valid.filter((o) => inLast(o, from, to));
        const nc = people.filter(isBuyer).filter(firstSeenIn(from, to)).length;
        weekly.push({ start: dayKey(new Date(todayLocal.getTime() - from * DAY + DAY)), revenue: Math.round(sumOf(wk)), orders: wk.length, new_customers: nc });
      }
      const ys = weekly.map((w) => w.revenue), n = ys.length, xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
      const slope = ys.reduce((a, y, i) => a + (i - xm) * (y - ym), 0) / Math.max(1, ys.reduce((a, _y, i) => a + (i - xm) ** 2, 0));
      const forecast = [1, 2, 3, 4].map((k) => Math.max(0, Math.round(ym + slope * (n - 1 - xm + k))));
      // When customers buy: 7 weekdays x 6 four-hour blocks.
      const heat = Array.from({ length: 7 }, () => Array(6).fill(0));
      for (const o of valid.filter((o) => inLast(o, 90))) { const d = local(o.created_at); heat[(d.getUTCDay() + 6) % 7][Math.floor(d.getUTCHours() / 4)] += 1; }
      // Order status mix (90 days).
      const statusCount: Record<string, number> = {};
      for (const o of allOrders.filter((o) => inLast(o, 90))) statusCount[o.status || "pending"] = (statusCount[o.status || "pending"] ?? 0) + 1;
      // Best sellers (90 days): units and revenue (an order's total is shared across its items by quantity).
      const prod = new Map<string, { name: string; units: number; revenue: number; orders: number }>();
      for (const o of valid.filter((o) => inLast(o, 90))) {
        const its = parseItems(o.items); const units = its.reduce((a, x) => a + x.qty, 0) || 1;
        for (const it of its) { const k = it.name.toLowerCase(); const v = prod.get(k) ?? { name: it.name, units: 0, revenue: 0, orders: 0 }; v.units += it.qty; v.revenue += (amt(o) * it.qty) / units; v.orders += 1; prod.set(k, v); }
      }
      const catalogue = (catI.data ?? []) as any[];
      // Matching a sold item name to a catalogue item ("Smart Watch" ~ "BST Smartwatch", "Wireless Headphones" ~ "Oraimo Headphone").
      const flat = (t: string) => String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
      const words = (t: string) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).map((w) => w.replace(/s$/, "")).filter((w) => w.length > 3));
      const match = (sold: string, cat: string) => {
        const f = flat(sold), kf = flat(cat);
        if (!f || !kf) return 0;
        let score = kf === f ? 10 : (kf.includes(f) || f.includes(kf)) && Math.min(kf.length, f.length) > 3 ? 6 : 0;
        const want = words(sold);
        for (const w of words(cat)) score += want.has(w) ? 3 : f.includes(w) ? (w.length >= 6 ? 2 : 1) : 0;
        return score;
      };
      const imgFor = (name: string) => {
        let best = { score: 0, img: "" };
        for (const k of catalogue) { if (!k.image_url) continue; const sc = match(name, k.name); if (sc > best.score) best = { score: sc, img: String(k.image_url) }; }
        return best.score >= 2 ? best.img : "";
      };
      const products = [...prod.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6).map((p) => ({ ...p, revenue: Math.round(p.revenue), image: imgFor(p.name) }));
      const soldNames = [...prod.values()].map((p) => p.name);
      const unsold = catalogue.filter((k) => !soldNames.some((n) => match(n, k.name) >= 3)).slice(0, 6).map((k) => ({ name: clip(k.name, 60), image: k.image_url || "" }));
      // Customers: where they come from, funnel, places, loyalty.
      const cust = custRows;
      const buyers = people.filter(isBuyer);
      const countBy = (rows: any[], key: string, top = 6) => {
        const m: Record<string, number> = {}; for (const r of rows) { const k = clip(r[key], 30) || "Other"; m[k] = (m[k] ?? 0) + 1; }
        const arr = Object.entries(m).sort((a, b) => b[1] - a[1]);
        const head = arr.slice(0, top - 1); const rest = arr.slice(top - 1).reduce((a, [, v]) => a + v, 0);
        return [...head, ...(rest ? [["Other", rest] as [string, number]] : [])].map(([label, value]) => ({ label, value }));
      };
      const funnel: { label: string; value: number }[] = [];
      const everLead = people.length;   // everyone Nexora knows: saved leads and customers plus everyone who ordered
      funnel.push({ label: "Contacts", value: everLead });
      funnel.push({ label: "Talking", value: people.filter((p) => p.orders > 0 || (p.segment && p.segment !== "Lead")).length });
      funnel.push({ label: "Qualified", value: people.filter((p) => p.orders > 0 || (p.segment && !["Lead", "Contacted"].includes(p.segment))).length });
      funnel.push({ label: "Customers", value: buyers.length });
      funnel.push({ label: "Repeat", value: people.filter((p) => p.orders >= 2).length });
      // Loyalty and value come from real orders only.
      const withOrders = people.filter((p) => p.orders >= 1);
      const repeatRate = withOrders.length ? Math.round((withOrders.filter((p) => p.orders >= 2).length / withOrders.length) * 100) : null;
      const ltv = withOrders.length ? Math.round(withOrders.reduce((a, p) => a + p.spent, 0) / withOrders.length) : null;
      const leadsNow = people.filter((p) => p.orders === 0 && leadSegs.includes(p.segment)).length;
      const conversion = everLead ? Math.round((buyers.length / everLead) * 100) : null;
      // Value tiers: share of money spent by the top 20%, next 30% and the rest of paying customers.
      const tiers = [{ label: "Top 20%", value: 0 }, { label: "Middle 30%", value: 0 }, { label: "Rest", value: 0 }];
      const spent = withOrders.map((p) => p.spent).sort((a, b) => b - a);
      spent.forEach((v, i) => { const q = i / Math.max(1, spent.length); tiers[q < 0.2 ? 0 : q < 0.5 ? 1 : 2].value += v; });
      const topShare = spent.length ? Math.round((tiers[0].value / Math.max(1, spent.reduce((a, b) => a + b, 0))) * 100) : null;
      // Chats per channel (30 days) and AI shop link visits.
      const conv30 = (convI.data ?? []).filter((c: any) => Date.now() - new Date(c.last_message_at || c.created_at).getTime() < 30 * DAY);
      const hits = (hitsI.data ?? []) as any[];
      const shop = { visits: hits.filter((h) => h.kind === "view").length, chats: hits.filter((h) => h.kind === "chat").length, leads: hits.filter((h) => h.kind === "lead").length };

      const rev30 = sumOf(valid.filter((o) => inLast(o, 30))), rev60 = sumOf(valid.filter((o) => inLast(o, 60, 30)));
      const n30 = valid.filter((o) => inLast(o, 30)).length, n60 = valid.filter((o) => inLast(o, 60, 30)).length;
      const aov = n30 ? Math.round(rev30 / n30) : 0, aovPrev = n60 ? Math.round(rev60 / n60) : 0;
      const recent90 = allOrders.filter((o) => inLast(o, 90));
      const cancelRate = recent90.length ? Math.round((recent90.filter((o) => o.status === "cancelled").length / recent90.length) * 100) : null;
      const open = allOrders.filter((o) => ["pending", "processing"].includes(o.status));
      const late = open.filter((o) => Date.now() - new Date(o.created_at).getTime() > 2 * DAY).length;
      const newCust30 = buyers.filter(firstSeenIn(30)).length, newCust60 = buyers.filter(firstSeenIn(60, 30)).length;
      const kpis = {
        revenue_30d: { value: Math.round(rev30), change: pctI(rev30, rev60), spark: weekly.map((w) => w.revenue) },
        orders_30d: { value: n30, change: pctI(n30, n60), spark: weekly.map((w) => w.orders) },
        avg_order: { value: aov, change: pctI(aov, aovPrev) },
        customers: { value: buyers.length, new_30d: newCust30, change: pctI(newCust30, newCust60), spark: weekly.map((w) => w.new_customers) },
        repeat_rate: { value: repeatRate },
        lifetime_value: { value: ltv },
        lead_conversion: { value: conversion, open_leads: leadsNow },
        forecast_30d: { value: forecast.reduce((a, b) => a + b, 0), trend: slope > ym * 0.03 ? "up" : slope < -ym * 0.03 ? "down" : "flat" },
      };
      // Health score out of 100, from five plain checks (20 points each).
      const clamp20 = (v: number) => Math.max(0, Math.min(20, Math.round(v)));
      const growthPts = kpis.revenue_30d.change === null ? (rev30 > 0 ? 12 : 4) : clamp20(10 + kpis.revenue_30d.change / 3);
      const loyaltyPts = repeatRate === null ? 6 : clamp20(repeatRate / 2);
      const convPts = conversion === null ? 6 : clamp20(conversion / 2.5);
      const fulfilPts = clamp20(20 - late * 4 - (cancelRate ?? 0) / 2);
      const activityPts = clamp20((n30 > 0 ? 8 : 0) + Math.min(6, conv30.length) + (shop.visits > 0 ? 3 : 0) + (catalogue.length >= 5 ? 3 : catalogue.length > 0 ? 1 : 0));
      const health = { score: growthPts + loyaltyPts + convPts + fulfilPts + activityPts,
        parts: [{ label: "Growth", value: growthPts }, { label: "Loyalty", value: loyaltyPts }, { label: "Conversion", value: convPts }, { label: "Delivery", value: fulfilPts }, { label: "Activity", value: activityPts }] };

      const trends = (Array.isArray(trendI.data?.data?.trends) ? trendI.data!.data.trends : []).slice(0, 4).map((t: any) => ({ title: clip(t.title, 90), summary: clip(t.summary, 200), url: String(t.sources?.[0]?.url || "") }));
      const data = {
        business: { name: businessName, industry, country, currency, plan: ws.plan ?? null, status: ws.subscription_status ?? null, role: ws.role ?? null, has_business: true },
        kpis, health, daily, weekly, forecast, heat, status: Object.entries(statusCount).map(([label, value]) => ({ label, value })),
        products, unsold, channels: countBy(cust, "channel"), chat_channels: countBy(conv30, "channel"), places: countBy(cust.filter((c) => c.location), "location", 6),
        funnel, tiers: tiers.map((t) => ({ ...t, value: Math.round(t.value) })), top_share: topShare, shop, cancel_rate: cancelRate, late_orders: late, open_orders: open.length,
        trends, catalogue_size: catalogue.length, orders_total: allOrders.length,
      };

      // AI analysis + ideas (kept 12 hours unless the numbers change or the member asks for new ideas).
      const sig = JSON.stringify([Math.round(rev30), n30, buyers.length, leadsNow, catalogue.length, industry]);
      let cached = insightsCache.get(me);
      if (body?.refresh || !cached || cached.sig !== sig || Date.now() - cached.at > 12 * 3600000) {
        const keyI = Deno.env.get("GROQ_API_KEY") ?? "";
        let ai: any = null;
        if (keyI && !(await useAiTask(admin, me, "check"))) {
          const factsI = {
            business: businessName, industry: industry || "not set", country: country || "not set", currency: currency || "local currency",
            kpis: { ...kpis, revenue_30d: { value: kpis.revenue_30d.value, change_pct: kpis.revenue_30d.change }, orders_30d: { value: n30, change_pct: kpis.orders_30d.change }, customers: { total: buyers.length, new_30d: newCust30 } },
            health_score: health.score, health_parts: health.parts, weekly_revenue_12w: weekly.map((w) => w.revenue), forecast_next_4_weeks: forecast,
            busiest: (() => { let b = { d: 0, h: 0, v: -1 }; heat.forEach((row, d) => row.forEach((v, h) => { if (v > b.v) b = { d, h, v }; })); return b.v > 0 ? `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][b.d]} ${b.h * 4}:00-${b.h * 4 + 4}:00` : "not enough orders"; })(),
            best_sellers: products.map((p) => ({ name: p.name, units: p.units, revenue: p.revenue })), not_selling: unsold.map((u) => u.name),
            catalogue: catalogue.slice(0, 25).map((k) => clip(k.name, 50)), customer_channels: data.channels, chat_channels: data.chat_channels, top_places: data.places,
            funnel, repeat_rate_pct: repeatRate, top20_share_of_spend_pct: topShare, cancel_rate_pct: cancelRate, late_orders: late, shop_link_30d: shop,
            market_trends: trends.map((t: any) => t.title),
          };
          ai = await groqJson(keyI,
            "You are Nexora, a senior business analyst and growth strategist for small and growing businesses. You read the owner's real numbers and write a short, sharp analysis plus innovative, profitable ideas made for THIS business (its industry, country, products, customers and channels). " +
            'Reply as JSON: {"summary": string (2 sentences, plain words, the state of the business with 1-2 key numbers), ' +
            '"insights": [{"title": string (max 60 chars), "detail": string (max 170 chars, cite the numbers), "tone": "good"|"warn"|"info"}] (4 items: what is working, what is at risk, a pattern in when/where/who buys, a hidden opportunity), ' +
            '"ideas": [{"title": string (max 55 chars), "why": string (max 180 chars, why it fits this business, citing a number or trend), "steps": [3 short concrete steps, each max 90 chars], ' +
            '"impact_low_pct": number, "impact_high_pct": number (estimated extra monthly revenue as % of the current 30-day revenue, be realistic: 2-40), "effort": "low"|"medium"|"high", "horizon": "this week"|"this month"|"this quarter", ' +
            '"category": one of ["Pricing","Bundles","Retention","New product","Marketing","Partnerships","Operations","New channel"], "product": string (exact name from best_sellers or catalogue it is about, or ""), "image_query": string (2-4 plain English words describing a real photo for this idea, e.g. "market stall phone accessories", no brand names)}] (6 ideas, mixed categories, at least 2 innovative ones the owner probably has not tried, such as subscriptions, bundles, referral rewards, B2B or corporate gifting, pre-orders, local partnerships, WhatsApp catalog drops, after-sales services). ' +
            "Use only the facts given; never invent numbers, customers or prices. Amounts are in the business currency: write numbers without a currency symbol. If there is little or no data yet, say so kindly in the summary and make the ideas about getting the first customers and setting up for growth in this industry and country.",
            JSON.stringify(factsI), 2200);
          if (ai) await useAiTask(admin, me, "insights", 1, false);
        }
        const ideasRaw = Array.isArray(ai?.ideas) ? ai.ideas.slice(0, 6) : [];
        const images: Record<string, string> = {};
        const [hero] = await Promise.all([
          commonsImage(industry ? `${industry} shop` : "small business shop"),
          ...ideasRaw.map(async (it: any, i: number) => {
            const fromProduct = it?.product ? imgFor(String(it.product)) : "";
            images[String(i)] = fromProduct || (await commonsImage(String(it?.image_query || it?.category || industry)));
          }),
        ]);
        cached = { at: Date.now(), sig, ai, images, hero: String(hero || "") };
        if (ai) insightsCache.set(me, cached);
      }
      const ai = cached.ai;
      const ideas = (Array.isArray(ai?.ideas) ? ai.ideas.slice(0, 6) : []).map((it: any, i: number) => ({
        title: clip(it?.title, 70), why: clip(it?.why, 220), steps: (Array.isArray(it?.steps) ? it.steps : []).slice(0, 4).map((x: unknown) => clip(x, 120)).filter(Boolean),
        impact_low_pct: Math.max(0, Math.min(80, Number(it?.impact_low_pct) || 0)), impact_high_pct: Math.max(0, Math.min(100, Number(it?.impact_high_pct) || 0)),
        effort: ["low", "medium", "high"].includes(it?.effort) ? it.effort : "medium", horizon: clip(it?.horizon, 20) || "this month",
        category: clip(it?.category, 24) || "Growth", image: cached!.images[String(i)] || "",
        // The same estimate in money, from the last 30 days' revenue (0 when there are no sales yet).
        impact_low_amount: Math.round(rev30 * Math.max(0, Math.min(80, Number(it?.impact_low_pct) || 0)) / 100),
        impact_high_amount: Math.round(rev30 * Math.max(0, Math.min(100, Number(it?.impact_high_pct) || 0)) / 100),
      })).filter((x: any) => x.title);
      const insights = (Array.isArray(ai?.insights) ? ai.insights.slice(0, 4) : []).map((x: any) => ({ title: clip(x?.title, 70), detail: clip(x?.detail, 200), tone: ["good", "warn", "info"].includes(x?.tone) ? x.tone : "info" })).filter((x: any) => x.title);
      return json({ success: true, data, summary: clip(ai?.summary, 320), insights, ideas, hero: cached.hero, ai: !!ai, generated_at: new Date(cached.at).toISOString() });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("nexora-insights", e instanceof Error ? e.message : String(e));
    return json({ success: false, message: "Couldn't prepare your insights. Please try again." }, 500);
  }
});
