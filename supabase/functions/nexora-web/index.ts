import { createClient } from "jsr:@supabase/supabase-js@2";
declare const EdgeRuntime: any;

// Nexora web: live web research for the business, through Groq's web-search models (groq/compound).
//  POST { action: 'trends', focus? }  -> what's trending right now that matters to this business
//  POST { action: 'find', query }     -> real websites / services online for something the owner needs
//  POST { action: 'read', url }      -> a web page as clean text blocks, so the app shows it inside Nexora (reader view)
//  POST { action: 'research' }       -> researches the business and its industry online and saves it to the knowledge base
//  POST { action: 'health' }          -> (no sign-in) whether live web search is available; no data, no AI call
//  POST { action: 'partners' }        -> businesses and people online (not on Nexora yet) that fit what you offer / need
//  POST { action: 'community', query } -> what the web says about a question (forums, guides, news)
//  POST { action: 'cron_trends' }     -> (scheduler only, x-cron-secret header) refreshes trends for businesses every 6 hours
// Trends are cached for 6 hours per member: the app gets the saved ones instantly, and the scheduler keeps them fresh.
// Every link returned comes from the search engine's own results, never written by the model.
// Each web search (trends, find, research, partners, community) is one AI task on the business's plan; 'read' isn't AI.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GROQ = "https://api.groq.com/openai/v1";
const SEARCH_MODELS = (Deno.env.get("GROQ_WEB_MODELS") || "groq/compound,groq/compound-mini").split(",").map((s) => s.trim()).filter(Boolean);
// Fallback: Groq's built-in browser_search tool on the gpt-oss models (available when compound isn't).
const BROWSER_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
// Removes the search model's citation markers such as 【1†L5-L9】 and [1] before text reaches the app.
const stripCites = (t: string) => t.replace(/【[^】]*】/g, "").replace(/\[\d+(?:[,\s]*\d+)*\]/g, "");
const clip = (v: unknown, n: number) => (typeof v === "string" ? stripCites(v).replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim().slice(0, n) : "");
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u);

type Source = { title: string; url: string; snippet: string };

// Plan limit: each AI reply or action is one AI task (use_ai_task in the database).
// Returns a message when the business has used this month's AI tasks; count 0 only checks.
async function useAiTask(admin: any, userId: string, kind: string, count = 0, check = true): Promise<string> {
  const { data, error } = await admin.rpc("use_ai_task", { p_user: userId, p_kind: kind, p_count: count, p_check: check });
  if (error) { console.error("[nexora-web] ai usage", error.message); return ""; }
  return data?.ok === false ? String(data.message || "This month's AI tasks are used up.") : "";
}

async function groqModels(key: string): Promise<string[]> {
  try {
    const r = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    return ((await r.json())?.data ?? []).map((m: any) => String(m.id));
  } catch { return []; }
}

// Pull every web page the search tool actually visited out of a Groq response.
function collectSources(msg: any): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  const add = (u: unknown, title?: unknown, snippet?: unknown) => {
    if (!isHttp(u)) return;
    const url = String(u).replace(/[)\].,;]+$/, "");
    if (seen.has(url)) return;
    seen.add(url);
    sources.push({ title: clip(title, 140) || domainOf(url), url, snippet: clip(snippet, 300) });
  };
  for (const t of msg?.executed_tools ?? []) {
    for (const r of t?.search_results?.results ?? []) add(r?.url, r?.title, r?.content);
    const out = typeof t?.output === "string" ? t.output : "";
    for (const m of out.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) add(m[0]);
  }
  return sources;
}

async function callGroq(key: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; msg: any; raw: string }> {
  const res = await fetch(`${GROQ}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
  const raw = await res.text();
  let msg: any = null;
  if (res.ok) { try { msg = JSON.parse(raw)?.choices?.[0]?.message; } catch { /* bad json */ } }
  return { ok: res.ok && !!msg, status: res.status, msg, raw };
}

// One web-searching completion. Returns the model's text plus every page the search tool actually found.
// Uses groq/compound when the account has it, otherwise gpt-oss + the built-in browser_search tool.
async function webSearch(key: string, system: string, user: string): Promise<{ content: string; sources: Source[]; model: string }> {
  const ids = await groqModels(key);
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const attempts: { model: string; payload: Record<string, unknown> }[] = [
    ...SEARCH_MODELS.filter((m) => ids.includes(m)).map((model) => ({ model, payload: { model, messages, temperature: 0.2, max_tokens: 1800 } })),
    ...BROWSER_MODELS.filter((m) => !ids.length || ids.includes(m)).map((model) => ({
      model, payload: { model, messages, tools: [{ type: "browser_search" }], tool_choice: "required", reasoning_effort: "low", temperature: 0.2, max_completion_tokens: 2200 },
    })),
  ];
  if (!attempts.length) throw Object.assign(new Error("Live web search isn't available on this Groq account."), { code: "unavailable" });
  let last = "";
  for (const { model, payload } of attempts) {
    let r = await callGroq(key, payload);
    // Some accounts reject tool_choice "required" for built-in tools: retry letting the model decide.
    if (!r.ok && r.status === 400 && payload.tool_choice === "required") r = await callGroq(key, { ...payload, tool_choice: "auto" });
    if (!r.ok) { last = `${model}: ${r.status} ${r.raw.slice(0, 200)}`; console.error("[nexora-web]", last); continue; }
    const sources = collectSources(r.msg);
    if (!sources.length && BROWSER_MODELS.includes(model)) { last = `${model}: no search results`; console.error("[nexora-web]", last); continue; }
    return { content: String(r.msg.content ?? ""), sources, model };
  }
  const busy = /429/.test(last);
  throw Object.assign(new Error(busy ? "Web search is busy right now. Try again in a minute." : "Web search is unavailable right now."), { code: busy ? "busy" : "error", detail: last });
}

function parseJson(text: string): any {
  const t = text.replace(/```json|```/g, "");
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Only keep links that the search engine returned (exact URL, or the same site).
function verify(urls: unknown, sources: Source[]): Source[] {
  const out: Source[] = [];
  for (const u of Array.isArray(urls) ? urls : []) {
    if (!isHttp(u)) continue;
    const exact = sources.find((s) => s.url === u);
    const sameSite = exact ?? sources.find((s) => domainOf(s.url) && domainOf(s.url) === domainOf(u));
    const pick = exact ?? (sameSite ? { ...sameSite, url: u } : null);
    if (pick && !out.some((o) => o.url === pick.url)) out.push(pick);
  }
  return out;
}

// ---------- web knowledge: what Nexora found online, saved as searchable passages that expire ----------
async function saveWebKnowledge(owner: string, group: string, items: { title: string; content: string; url: string }[], days: number) {
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  await admin.from("knowledge_chunks").delete().eq("user_id", owner).eq("source_type", "web").eq("category", group);
  const rows = items.filter((i) => i.title && i.content).slice(0, 12).map((i, n) => ({
    user_id: owner, source_type: "web", category: group, title: i.title.slice(0, 200), chunk_index: n,
    content: i.content.slice(0, 1500), source_url: i.url || null, expires_at: new Date(Date.now() + days * 86400000).toISOString(),
  }));
  if (!rows.length) return 0;
  const { error } = await admin.from("knowledge_chunks").insert(rows);
  if (error) { console.error("[nexora-web] save knowledge", error.message); return 0; }
  const job = fetch(`${url}/functions/v1/rag-index`, { method: "POST", headers: { Authorization: `Bearer ${service}`, apikey: service, "Content-Type": "application/json", "x-internal-owner": owner }, body: JSON.stringify({ action: "embed" }) }).catch(() => {});
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
  return rows.length;
}

// ---------- reader view: fetch a page server-side and keep only readable content ----------
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const PRIVATE_V4 = /^(0|10|127)\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const isPrivateHost = (host: string) =>
  host.includes(":") ? /^(::|::1|f[cd]|fe8|fe9|fea|feb|::ffff:)/i.test(host)
  : /^\d+\.\d+\.\d+\.\d+$/.test(host) ? PRIVATE_V4.test(host) : false;
function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (BLOCKED_HOST.test(host) || isPrivateHost(host) || (!host.includes(".") && !host.includes(":"))) return null;
    if (u.port && !["80", "443", "8080"].includes(u.port)) return null;
    return u;
  } catch { return null; }
}
const decode = (t: string) => t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const textOf = (h: string) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const meta = (html: string, name: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"));
  const c = m?.[0].match(/content=["']([^"']*)["']/i);
  return c ? decode(c[1]).trim() : "";
};
async function readPage(raw: string) {
  let target = safeUrl(raw);
  if (!target) throw Object.assign(new Error("That link can't be opened."), { status: 400 });
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(target.toString(), { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 NexoraReader/1.0", Accept: "text/html,application/xhtml+xml" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = safeUrl(new URL(res.headers.get("location")!, target).toString());
      if (!next) throw Object.assign(new Error("That link redirects somewhere Nexora can't open."), { status: 400 });
      target = next; continue;
    }
    break;
  }
  if (!res || !res.ok) throw Object.assign(new Error(`The site answered with an error (${res?.status ?? "no response"}).`), { status: 502 });
  const type = res.headers.get("content-type") || "";
  if (!/html|xml|text\/plain/i.test(type)) return { url: target.toString(), title: target.hostname, site: target.hostname, blocks: [{ type: "p", text: "This link is a file, not a web page. Open it in your browser to download it." }], links: [], image: "", description: "", file: true };
  const buf = new Uint8Array(await res.arrayBuffer()).slice(0, 2_000_000);
  let html = new TextDecoder("utf-8").decode(buf);
  const title = meta(html, "og:title") || textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") || target.hostname;
  const site = meta(html, "og:site_name") || target.hostname.replace(/^www\./, "");
  const description = meta(html, "og:description") || meta(html, "description");
  let image = meta(html, "og:image");
  try { if (image) image = new URL(image, target).toString(); } catch { image = ""; }
  html = html.replace(/<(script|style|noscript|svg|iframe|form|template)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*<\/body>/i)?.[0] || html;
  const body = main.replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ");
  const blocks: { type: string; text?: string; src?: string }[] = [];
  const re = /<(h[1-4]|p|li|blockquote|td)[^>]*>([\s\S]*?)<\/\1>|<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null; let chars = 0; const seen = new Set<string>();
  while ((m = re.exec(body)) && blocks.length < 160 && chars < 40000) {
    if (m[3]) {
      try { const src = new URL(decode(m[3]), target).toString(); if (/^https:/.test(src) && !/\.svg|pixel|track|logo|icon|avatar|1x1/i.test(src) && blocks.filter((b) => b.type === "img").length < 8) blocks.push({ type: "img", src }); } catch { /* bad src */ }
      continue;
    }
    const tag = m[1].toLowerCase(); const t = textOf(m[2]);
    if (!t || seen.has(t) || (tag !== "h1" && tag !== "h2" && tag !== "h3" && tag !== "h4" && t.length < 25)) continue;
    seen.add(t); chars += t.length;
    blocks.push({ type: tag.startsWith("h") ? "h" : tag === "li" ? "li" : tag === "blockquote" ? "quote" : "p", text: t.slice(0, 1500) });
  }
  if (!blocks.some((b) => b.type !== "img")) { const t = textOf(body).slice(0, 4000); if (t) blocks.push({ type: "p", text: t }); }
  const links: { text: string; url: string }[] = [];
  const lre = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = lre.exec(body)) && links.length < 30) {
    try { const href = new URL(decode(m[1]), target).toString(); const t = textOf(m[2]); if (/^https?:/.test(href) && t.length > 3 && !links.some((l) => l.url === href)) links.push({ text: t.slice(0, 100), url: href }); } catch { /* bad href */ }
  }
  return { url: target.toString(), title: title.slice(0, 200), site, description: description.slice(0, 300), image, blocks, links };
}

const TREND_TTL_MS = 6 * 3600000;
const TREND_TYPES = ["demand", "social", "competitor", "news", "regulation", "event", "price"];

// Business context for prompts, from the owner's own data (service client: used by the app and the scheduler).
async function businessContext(admin: any, owner: string) {
  const [bizR, profR, kbR, ordR] = await Promise.all([
    admin.from("businesses").select("name,industry,country").eq("owner_id", owner).maybeSingle(),
    admin.from("profiles").select("business_name").eq("id", owner).maybeSingle(),
    admin.from("knowledge_items").select("category,name").eq("user_id", owner).in("category", ["products", "services"]).neq("status", "Draft").limit(40),
    admin.from("orders").select("items").eq("user_id", owner).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(300),
  ]);
  const business = clip(bizR.data?.name || profR.data?.business_name || "", 120) || "a small business";
  const industry = clip(bizR.data?.industry, 80);
  const country = clip(bizR.data?.country, 60) || "Nigeria";
  const offers = (kbR.data ?? []).map((i: any) => clip(i.name, 60)).filter(Boolean).slice(0, 15);
  const sold: Record<string, number> = {};
  for (const o of ordR.data ?? []) for (const part of String((o as any).items || "").split(",")) {
    const m = /^\s*(.*?)\s*(?:x\s*(\d+))?\s*$/i.exec(part);
    if (m && m[1]) sold[m[1]] = (sold[m[1]] || 0) + Number(m[2] || 1);
  }
  const topSold = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => clip(n, 60));
  const context = `Business: ${business}${industry ? ` (${industry})` : ""}, based in ${country}.${offers.length ? ` Sells / offers: ${offers.join(", ")}.` : ""}${topSold.length ? ` Best sellers this month: ${topSold.join(", ")}.` : ""}`;
  return { business, industry, country, offers, context };
}

// What's trending for this business + trending businesses/niches in its market, from live web search.
async function computeTrends(key: string, ctx: { business: string; industry: string; country: string; context: string }, focus: string) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `You are a market-research analyst for small businesses. Today is ${today}. Use web search to find what is trending RIGHT NOW (past 30 days) that matters to the business described. Look at: consumer demand and search interest, social media trends, competitor moves and prices, news, regulations or tax changes, upcoming events and seasons in ${ctx.country}. Also find which kinds of businesses and niches are growing fast in ${ctx.country} right now (especially near this business's industry).
Return ONLY JSON, no markdown:
{"trends":[{"title":string,"type":"demand"|"social"|"competitor"|"news"|"regulation"|"event"|"price","summary":string,"why_it_matters":string,"action":string,"urls":[string]}],
 "businesses":[{"name":string,"summary":string,"opportunity":string,"urls":[string]}]}
Rules: 4 to 6 trends and 3 to 5 trending businesses, most useful first. Everything must come from what you found in search results; put the result URLs you used in "urls". summary <= 220 chars, why_it_matters <= 200 chars (speak to this business directly), action <= 160 chars (one concrete step they can take this week); for businesses, name = the kind of business or niche (e.g. "Solar installation for homes"), opportunity <= 180 chars (how this business could benefit or partner). Never invent numbers, dates or links.`;
  const { content, sources } = await webSearch(key, system, `${ctx.context}${focus ? `\nFocus on: ${focus}` : ""}\nWhat's trending that this business should know about and act on, and which businesses are trending?`);
  const parsed = parseJson(content);
  let trends = (Array.isArray(parsed?.trends) ? parsed.trends : []).map((t: any) => ({
    title: clip(t?.title, 120), type: TREND_TYPES.includes(t?.type) ? t.type : "news",
    summary: clip(t?.summary, 260), why_it_matters: clip(t?.why_it_matters, 240), action: clip(t?.action, 200),
    sources: verify(t?.urls, sources).slice(0, 3),
  })).filter((t: any) => t.title && t.summary).slice(0, 6);
  trends = trends.map((t: any) => (t.sources.length ? t : { ...t, sources: sources.filter((s) => (s.title + s.snippet).toLowerCase().includes(t.title.toLowerCase().split(" ")[0])).slice(0, 2) }));
  const businesses = (Array.isArray(parsed?.businesses) ? parsed.businesses : []).map((b: any) => ({
    name: clip(b?.name, 100), summary: clip(b?.summary, 240), opportunity: clip(b?.opportunity, 200), sources: verify(b?.urls, sources).slice(0, 2),
  })).filter((b: any) => b.name && b.summary).slice(0, 5);
  return { trends, businesses };
}

async function storeTrends(admin: any, owner: string, ctx: any, result: { trends: any[]; businesses: any[] }) {
  const data = { generated_at: new Date().toISOString(), business: ctx.business, industry: ctx.industry, country: ctx.country, ...result };
  await admin.from("trend_snapshots").upsert({ user_id: owner, data, fetched_at: data.generated_at });
  // Keep the general trends in the knowledge base for 3 days, so Brain answers can use them.
  await saveWebKnowledge(owner, "trends", [
    ...result.trends.map((t: any) => ({ title: `Trend: ${t.title}`, content: `${t.summary} Why it matters: ${t.why_it_matters} Suggested action: ${t.action}`, url: t.sources?.[0]?.url || "" })),
    ...result.businesses.map((b: any) => ({ title: `Trending business: ${b.name}`, content: `${b.summary} Opportunity: ${b.opportunity}`, url: b.sources?.[0]?.url || "" })),
  ], 3);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ success: false, message: "The AI service isn't configured yet." }, 503);

    if (action === "health") {
      const ids = await groqModels(key);
      return json({ success: true, web_search: SEARCH_MODELS.filter((m) => ids.includes(m)), models_listed: ids.length, search_capable: ids.filter((m) => /compound|search|browse/i.test(m)) });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Scheduler: refresh trends for businesses whose saved trends are older than 6 hours ----
    if (action === "cron_trends") {
      const secret = req.headers.get("x-cron-secret") ?? "";
      const { data: okSecret } = await admin.rpc("nexora_cron_secret_ok", { p_secret: secret });
      if (okSecret !== true) return json({ success: false, message: "Not allowed." }, 403);
      const { data: owners } = await admin.from("businesses").select("owner_id").limit(500);
      const { data: snaps } = await admin.from("trend_snapshots").select("user_id,fetched_at");
      const fresh = new Map((snaps ?? []).map((r: any) => [r.user_id, new Date(r.fetched_at).getTime()]));
      const due = (owners ?? []).map((o: any) => o.owner_id).filter((id: string) => !fresh.has(id) || Date.now() - (fresh.get(id) as number) > TREND_TTL_MS - 600000)
        .sort((a: string, b: string) => (fresh.get(a) ?? 0) - (fresh.get(b) ?? 0)).slice(0, 5);
      const results = await Promise.allSettled(due.map(async (owner: string) => {
        if (await useAiTask(admin, owner, "check")) return 0;   // no AI tasks left this month: keep the saved trends
        const ctx = await businessContext(admin, owner);
        const r = await computeTrends(key, ctx, "");
        if (r.trends.length) { await storeTrends(admin, owner, ctx, r); await useAiTask(admin, owner, "trends", 1, false); }
        return r.trends.length;
      }));
      return json({ success: true, refreshed: results.filter((r) => r.status === "fulfilled").length, due: due.length });
    }

    const supabase = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await supabase.auth.getUser();
    if (!ud?.user) return json({ success: false, message: "Please sign in again." }, 401);

    if (action === "read") {
      try { return json({ success: true, page: await readPage(String(body?.url ?? "")) }); }
      catch (e) { return json({ success: false, message: (e as Error).message || "Couldn't open that page." }, (e as any).status || 502); }
    }

    // Every action below is a web search: one AI task, refused when the business has none left this month.
    const quota = await useAiTask(admin, ud.user.id, "check");
    const spend = (kind: string) => useAiTask(admin, ud.user.id, kind, 1, false);
    const noTasks = () => json({ success: false, code: "quota", message: quota }, 429);

    // ---- business context (company, what it sells, what's selling) ----
    const wsR = await supabase.rpc("my_workspace");
    const ws: any = Array.isArray(wsR.data) ? wsR.data[0] : wsR.data;
    const [profR, kbR, ordR] = await Promise.all([
      supabase.from("profiles").select("business_name").eq("id", ud.user.id).maybeSingle(),
      supabase.from("knowledge_items").select("category,name").in("category", ["products", "services"]).neq("status", "Draft").limit(40),
      supabase.from("orders").select("items").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(300),
    ]);
    const business = clip(ws?.name || profR.data?.business_name || "", 120) || "a small business";
    const industry = clip(ws?.industry, 80);
    const country = clip(ws?.country, 60) || "Nigeria";
    const offers = (kbR.data ?? []).map((i: any) => clip(i.name, 60)).filter(Boolean).slice(0, 15);
    const sold: Record<string, number> = {};
    for (const o of ordR.data ?? []) for (const part of String((o as any).items || "").split(",")) {
      const m = /^\s*(.*?)\s*(?:x\s*(\d+))?\s*$/i.exec(part);
      if (m && m[1]) sold[m[1]] = (sold[m[1]] || 0) + Number(m[2] || 1);
    }
    const topSold = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => clip(n, 60));
    const today = new Date().toISOString().slice(0, 10);
    const context = `Business: ${business}${industry ? ` (${industry})` : ""}, based in ${country}.${offers.length ? ` Sells / offers: ${offers.join(", ")}.` : ""}${topSold.length ? ` Best sellers this month: ${topSold.join(", ")}.` : ""}`;

    if (action === "trends") {
      const focus = clip(body?.focus, 160);
      // Staff see the owner's trends.
      const owner = ws?.role === "staff" ? ((await admin.from("businesses").select("owner_id").eq("id", ws?.business_id ?? "").maybeSingle()).data?.owner_id || ud.user.id) : ud.user.id;
      if (!focus) {
        const { data: snap, error: snapErr } = await admin.from("trend_snapshots").select("data,fetched_at").eq("user_id", owner).maybeSingle();
        const age = snap ? Date.now() - new Date(snap.fetched_at).getTime() : Infinity;
        // Saved trends are used for 6 hours; "refresh" can force a new search at most every 30 minutes.
        // With no AI tasks left, saved trends of any age are shown instead of searching again.
        if (snap && !snapErr && ((age < TREND_TTL_MS && (body?.refresh !== true || age < 30 * 60000)) || quota)) {
          return json({ success: true, cached: true, next_refresh_at: new Date(new Date(snap.fetched_at).getTime() + TREND_TTL_MS).toISOString(), ...snap.data });
        }
      }
      if (quota) return noTasks();
      const ctx = { business, industry, country, context };
      const r = await computeTrends(key, ctx, focus);
      if (!r.trends.length) return json({ success: false, code: "empty", message: "Couldn't find clear trends right now. Try again in a few minutes." }, 502);
      await spend("trends");
      if (!focus) {
        const data = await storeTrends(admin, owner, ctx, r);
        return json({ success: true, cached: false, next_refresh_at: new Date(Date.now() + TREND_TTL_MS).toISOString(), ...data });
      }
      return json({ success: true, generated_at: new Date().toISOString(), business, industry, country, ...r });
    }

    if (action === "partners") {
      if (quota) return noTasks();
      const { data: np } = await supabase.from("network_profiles").select("display_name,industry,city,country,offers,needs,bio").eq("user_id", ud.user.id).maybeSingle();
      const offersText = clip(np?.offers, 300) || offers.join(", ");
      const needsText = clip(np?.needs, 300);
      const place = [clip(np?.city, 60), clip(np?.country, 60) || country].filter(Boolean).join(", ");
      const focus = clip(body?.focus, 160);
      const system = `You find real business partners for a small business. Today is ${today}. Use web search to find real businesses, suppliers, distributors, service providers, influencers, associations or people in or near ${place} that would be good partners: they could supply what this business needs, buy or resell what it offers, or reach the same customers without competing.
Return ONLY JSON, no markdown:
{"results":[{"name":string,"kind":"supplier"|"customer"|"partner"|"association"|"influencer","url":string,"location":string,"why":string,"how_to_approach":string}]}
Rules: up to 8 results, best fit first. "url" must be a page from your search results (their website, social page or directory listing). why <= 160 chars, how_to_approach <= 140 chars (a concrete first step). Never invent names, phone numbers or links. Do not include personal phone numbers or emails.`;
      const { content, sources } = await webSearch(key, system, `${context}\nWhat they offer: ${offersText || "not specified"}\nWhat they need: ${needsText || "customers, suppliers and partners"}${focus ? `\nLooking specifically for: ${focus}` : ""}`);
      await spend("partners");
      const parsed = parseJson(content);
      const kinds = ["supplier", "customer", "partner", "association", "influencer"];
      let results = (Array.isArray(parsed?.results) ? parsed.results : []).map((r: any) => {
        const v = verify([r?.url], sources)[0];
        return v ? { name: clip(r?.name, 100) || v.title, kind: kinds.includes(r?.kind) ? r.kind : "partner", url: v.url, domain: domainOf(v.url), location: clip(r?.location, 80), why: clip(r?.why, 200) || v.snippet.slice(0, 160), how_to_approach: clip(r?.how_to_approach, 180) } : null;
      }).filter(Boolean) as any[];
      if (!results.length) results = sources.slice(0, 6).map((s) => ({ name: s.title, kind: "partner", url: s.url, domain: domainOf(s.url), location: "", why: s.snippet.slice(0, 160), how_to_approach: "" }));
      if (!results.length) return json({ success: false, code: "empty", message: "Nothing reliable came up online. Add more detail to what you offer and need." }, 404);
      return json({ success: true, results: results.slice(0, 8) });
    }

    if (action === "community") {
      const query = clip(body?.query, 240);
      if (!query) return json({ success: false, message: "What would you like to know?" }, 400);
      if (quota) return noTasks();
      const system = `You help small-business owners in ${country} learn from others. Today is ${today}. Use web search to find what other business owners and trusted sources say about the question: forum threads, community discussions, practical guides, news and official guidance (prefer sources relevant to ${country} and Africa where possible).
Return ONLY JSON, no markdown:
{"summary":string,"results":[{"title":string,"url":string,"kind":"discussion"|"guide"|"news"|"official","takeaway":string}]}
Rules: up to 6 results. "url" must be a page from your search results. takeaway <= 180 chars: the most useful practical point from that page. summary <= 320 chars: what most sources agree on. Never invent links.`;
      const { content, sources } = await webSearch(key, system, `Question from a business owner: ${query}\nTheir business: ${context}`);
      await spend("web_community");
      const parsed = parseJson(content);
      const kinds = ["discussion", "guide", "news", "official"];
      let results = (Array.isArray(parsed?.results) ? parsed.results : []).map((r: any) => {
        const v = verify([r?.url], sources)[0];
        return v ? { title: clip(r?.title, 140) || v.title, url: v.url, domain: domainOf(v.url), kind: kinds.includes(r?.kind) ? r.kind : "guide", takeaway: clip(r?.takeaway, 200) || v.snippet.slice(0, 180) } : null;
      }).filter(Boolean) as any[];
      if (!results.length) results = sources.slice(0, 6).map((s) => ({ title: s.title, url: s.url, domain: domainOf(s.url), kind: "guide", takeaway: s.snippet.slice(0, 180) }));
      if (!results.length) return json({ success: false, code: "empty", message: "Nothing reliable came up online for that." }, 404);
      return json({ success: true, summary: clip(parsed?.summary, 360), results: results.slice(0, 6) });
    }

    if (action === "research") {
      // Only the owner's knowledge base is researched (staff use the owner's).
      if (ws?.role === "staff") return json({ success: false, message: "Only the business owner can run research." }, 403);
      if (quota) return noTasks();
      const system = `You research a small business and its industry for its AI assistant. Today is ${today}. Use web search.
Find: (1) what is publicly said about this exact business online, if anything (website, social pages, reviews, listings); (2) the key concepts, customer expectations, typical prices and good practices in its industry in ${country}; (3) relevant rules, taxes or certifications for this kind of business in ${country}.
Return ONLY JSON: {"facts":[{"title":string,"content":string,"urls":[string]}]}
Rules: 6 to 10 facts. Each content <= 450 chars, specific and useful to someone running this business (numbers, names, dates where found). Only from search results; put the result URLs you used in "urls". If nothing is found about the exact business, say so in one fact. Never invent.`;
      const { content, sources } = await webSearch(key, system, context);
      await spend("research");
      const parsed = parseJson(content);
      const facts = (Array.isArray(parsed?.facts) ? parsed.facts : []).map((f: any) => {
        const src = verify(f?.urls, sources)[0];
        return { title: clip(f?.title, 150), content: clip(f?.content, 600), url: src?.url || "" };
      }).filter((f: any) => f.title && f.content).slice(0, 10);
      if (!facts.length) return json({ success: false, code: "empty", message: "Couldn't find useful information right now. Try again later." }, 502);
      const saved = await saveWebKnowledge(ud.user.id, "research", facts, 14);
      const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await service.from("learning_state").upsert({ user_id: ud.user.id, researched_at: new Date().toISOString() }, { onConflict: "user_id" });
      return json({ success: true, saved, facts });
    }

    if (action === "find") {
      const query = clip(body?.query, 200);
      if (!query) return json({ success: false, message: "Tell Nexora what you need." }, 400);
      if (quota) return noTasks();
      const system = `You help a small-business owner find real, reputable websites and services online. Today is ${today}. Use web search. Prefer official sites, well-known marketplaces and providers that serve ${country}.
Return ONLY JSON, no markdown:
{"summary":string,"results":[{"title":string,"url":string,"why":string}]}
Rules: up to 6 results, best first; "url" must be a page from your search results; "why" <= 140 chars explains why it fits this business; summary <= 260 chars with any tip (e.g. what to compare). Never invent links.`;
      const { content, sources } = await webSearch(key, system, `${context}\nThe owner needs: ${query}`);
      await spend("find");
      const parsed = parseJson(content);
      let results = (Array.isArray(parsed?.results) ? parsed.results : []).map((r: any) => {
        const v = verify([r?.url], sources)[0];
        return v ? { title: clip(r?.title, 120) || v.title, url: v.url, domain: domainOf(v.url), why: clip(r?.why, 180) || v.snippet.slice(0, 140) } : null;
      }).filter(Boolean) as any[];
      if (!results.length) results = sources.slice(0, 6).map((s) => ({ title: s.title, url: s.url, domain: domainOf(s.url), why: s.snippet.slice(0, 140) }));
      if (!results.length) return json({ success: false, code: "empty", message: "Nothing reliable came up. Try different words." }, 404);
      return json({ success: true, summary: clip(parsed?.summary, 300), results: results.slice(0, 6) });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    const code = (e as any)?.code || "error";
    console.error("[nexora-web]", e);
    return json({ success: false, code, message: (e as Error)?.message || "Web research failed." }, code === "busy" ? 429 : code === "unavailable" ? 503 : 502);
  }
});
