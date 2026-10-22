import { createClient } from "jsr:@supabase/supabase-js@2";

// Nexora network: opt-in matching between businesses and people with complementary needs.
//  POST { action: 'get' }                      -> my profile + contact details
//  POST { action: 'draft' }                    -> AI-written profile from my business knowledge (not saved)
//  POST { action: 'save', profile, contacts }  -> save + index my profile (visible only if profile.visible)
//  POST { action: 'matches' }                  -> best partners for me, each with a reason
//  POST { action: 'connect', to_user, message, reason }
//  POST { action: 'respond', id, accept }
//  POST { action: 'connections' }              -> my requests; contact details appear once accepted
// Privacy: profiles are hidden until the member makes them visible; contact details are only readable by
// members whose connection request was accepted (enforced by database policies).
// The AI profile draft and the AI match reasons are one AI task each on the business's plan.
declare const Supabase: any;

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
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

let embedder: any = null;
async function embed(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  if (!embedder) embedder = new Supabase.ai.Session("gte-small");
  const out = await embedder.run(text.slice(0, 1500), { mean_pool: true, normalize: true });
  return JSON.stringify(Array.from(out as ArrayLike<number>));
}

async function groqJson(key: string, system: string, user: string): Promise<any> {
  for (const model of MODELS) {
    const payload: Record<string, unknown> = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3, max_tokens: 1200, response_format: { type: "json_object" } };
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
  if (error) { console.error("[network] ai usage", error.message); return ""; }
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
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const key = Deno.env.get("GROQ_API_KEY") ?? "";
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);   // only for counting AI tasks

    if (action === "get") {
      const [p, c] = await Promise.all([
        db.from("network_profiles").select("display_name,industry,city,country,bio,offers,needs,tags,visible,updated_at").eq("user_id", me).maybeSingle(),
        db.from("network_contacts").select("whatsapp,email,website").eq("user_id", me).maybeSingle(),
      ]);
      if (p.error?.code === "42P01") return json({ success: false, code: "setup", message: "The partner network isn't set up on the server yet." }, 503);
      return json({ success: true, profile: p.data, contacts: c.data });
    }

    if (action === "draft") {
      if (!key) return json({ success: false, message: "The AI service isn't configured yet." }, 503);
      const quota = await useAiTask(admin, me, "check");
      if (quota) return json({ success: false, code: "quota", message: quota }, 429);
      const wsR = await db.rpc("my_workspace");
      const ws: any = Array.isArray(wsR.data) ? wsR.data[0] : wsR.data;
      const owner = ws?.role === "staff" ? null : me;
      const [prof, items] = await Promise.all([
        db.from("profiles").select("full_name,business_name").eq("id", me).maybeSingle(),
        owner ? db.from("knowledge_items").select("category,name,overview").neq("status", "Draft").limit(60) : Promise.resolve({ data: [] }),
      ]);
      const kb = ((items as any).data ?? []).map((i: any) => `${i.category}: ${i.name}${i.overview ? ` - ${String(i.overview).slice(0, 120)}` : ""}`).join("\n").slice(0, 5000);
      const out = await groqJson(key, `You write short, honest profiles for a business networking directory. Return ONLY JSON:
{"display_name":string,"industry":string,"city":string,"country":string,"bio":string,"offers":string,"needs":string,"tags":[string]}
bio <= 300 chars. offers = what this business can provide to other businesses (products, services, skills, wholesale, referrals) <= 300 chars. needs = what partners they'd benefit from (suppliers, logistics, marketing, investors, distributors, complementary shops) <= 300 chars, inferred sensibly. 3 to 6 lowercase tags. Use only the facts given; leave city empty if unknown.`,
        `Business: ${ws?.name || prof.data?.business_name || ""}\nIndustry: ${ws?.industry || ""}\nCountry: ${ws?.country || ""}\nOwner: ${prof.data?.full_name || ""}\nKnowledge:\n${kb || "(none)"}`);
      if (!out) return json({ success: false, message: "Couldn't draft a profile right now. Try again." }, 502);
      await useAiTask(admin, me, "profile_draft", 1, false);
      return json({ success: true, profile: {
        display_name: clip(out.display_name, 120) || clip(ws?.name, 120), industry: clip(out.industry, 80), city: clip(out.city, 60),
        country: clip(out.country, 60) || clip(ws?.country, 60), bio: clip(out.bio, 600), offers: clip(out.offers, 600), needs: clip(out.needs, 600),
        tags: (Array.isArray(out.tags) ? out.tags : []).map((t: unknown) => clip(t, 30).toLowerCase()).filter(Boolean).slice(0, 8),
      } });
    }

    if (action === "save") {
      const p = body?.profile ?? {};
      const profile = {
        user_id: me, display_name: clip(p.display_name, 120), industry: clip(p.industry, 80), city: clip(p.city, 60), country: clip(p.country, 60),
        bio: clip(p.bio, 600), offers: clip(p.offers, 600), needs: clip(p.needs, 600),
        tags: (Array.isArray(p.tags) ? p.tags : []).map((t: unknown) => clip(t, 30).toLowerCase()).filter(Boolean).slice(0, 8),
        visible: p.visible === true, updated_at: new Date().toISOString(),
      };
      if (!profile.display_name) return json({ success: false, message: "Add a name for your profile." }, 400);
      if (profile.visible && !profile.offers && !profile.needs) return json({ success: false, message: "Say what you offer or what you need, so Nexora can match you." }, 400);
      const whole = `${profile.display_name}. ${profile.industry}. ${profile.city} ${profile.country}. ${profile.bio} Offers: ${profile.offers} Needs: ${profile.needs} ${profile.tags.join(" ")}`;
      const [ep, eo, en] = [await embed(whole), await embed(`${profile.industry}. ${profile.offers}`), await embed(`${profile.industry}. ${profile.needs}`)];
      const { error } = await db.from("network_profiles").upsert({ ...profile, emb_profile: ep, emb_offers: eo, emb_needs: en }, { onConflict: "user_id" });
      if (error) { console.error("[network] save", error.message); return json({ success: false, message: error.code === "42P01" ? "The partner network isn't set up on the server yet." : "Couldn't save your profile." }, 500); }
      const c = body?.contacts ?? {};
      const contacts = { user_id: me, whatsapp: clip(c.whatsapp, 30), email: clip(c.email, 120).toLowerCase(), website: clip(c.website, 200) };
      if (contacts.website && !/^https?:\/\//i.test(contacts.website)) contacts.website = `https://${contacts.website}`;
      await db.from("network_contacts").upsert(contacts, { onConflict: "user_id" });
      return json({ success: true });
    }

    if (action === "matches") {
      const { data, error } = await db.rpc("match_network", { p_user: me, match_count: 12 });
      if (error) return json({ success: false, message: error.code === "42883" ? "The partner network isn't set up on the server yet." : "Couldn't load matches." }, 500);
      const list = (data ?? []) as any[];
      if (!list.length) return json({ success: true, matches: [] });
      const mine = (await db.from("network_profiles").select("display_name,industry,offers,needs").eq("user_id", me).maybeSingle()).data;
      let reasons: Record<string, string> = {};
      // AI reasons while the business has AI tasks left; otherwise the simple reasons below are used.
      if (key && mine && !(await useAiTask(admin, me, "check"))) {
        const out = await groqJson(key, `For each candidate, write ONE sentence (<= 25 words) on why they and the member could work together: what each gives the other. Be concrete. Return ONLY JSON {"reasons":{"<id>":string}}.`,
          `MEMBER: ${mine.display_name} (${mine.industry}). Offers: ${mine.offers}. Needs: ${mine.needs}.\nCANDIDATES:\n${list.slice(0, 10).map((m) => `${m.user_id}: ${m.display_name} (${m.industry}, ${m.city} ${m.country}). Offers: ${m.offers}. Needs: ${m.needs}.`).join("\n")}`);
        if (out) await useAiTask(admin, me, "partner_matches", 1, false);
        reasons = (out?.reasons && typeof out.reasons === "object") ? out.reasons : {};
      }
      return json({ success: true, matches: list.map((m) => ({
        user_id: m.user_id, display_name: m.display_name, industry: m.industry, city: m.city, country: m.country, bio: m.bio,
        offers: m.offers, needs: m.needs, tags: m.tags,
        score: Math.max(1, Math.min(99, Math.round(((Number(m.score) - 0.7) / 0.25) * 100))),
        reason: clip(reasons[m.user_id], 220) || (Number(m.need_fit) >= Number(m.offer_fit) ? "They offer things you said you need." : "They need what you offer."),
      })) });
    }

    if (action === "connect") {
      if (!uuid(body?.to_user) || body.to_user === me) return json({ success: false, message: "Pick someone to connect with." }, 400);
      const mine = (await db.from("network_profiles").select("visible").eq("user_id", me).maybeSingle()).data;
      if (!mine?.visible) return json({ success: false, code: "profile", message: "Make your own profile visible first, so they can see who you are." }, 400);
      const { error } = await db.from("network_connections").insert({ from_user: me, to_user: body.to_user, message: clip(body?.message, 500), match_reason: clip(body?.reason, 300) });
      if (error) return json({ success: false, message: error.code === "23505" ? "You've already sent them a request." : "Couldn't send the request." }, 400);
      return json({ success: true });
    }

    if (action === "respond") {
      if (!uuid(body?.id)) return json({ success: false, message: "Missing request." }, 400);
      const { data: row } = await db.from("network_connections").select("id,to_user,from_user,status").eq("id", body.id).maybeSingle();
      if (!row) return json({ success: false, message: "That request no longer exists." }, 404);
      const status = row.to_user === me ? (body?.accept ? "accepted" : "declined") : row.from_user === me ? "cancelled" : null;
      if (!status || row.status !== "pending") return json({ success: false, message: "You can't change this request." }, 400);
      const { error } = await db.from("network_connections").update({ status, responded_at: new Date().toISOString() }).eq("id", row.id);
      if (error) return json({ success: false, message: "Couldn't update the request." }, 500);
      return json({ success: true, status });
    }

    if (action === "connections") {
      const { data, error } = await db.from("network_connections").select("id,from_user,to_user,status,message,match_reason,created_at,responded_at")
        .or(`from_user.eq.${me},to_user.eq.${me}`).neq("status", "cancelled").order("created_at", { ascending: false }).limit(100);
      if (error) return json({ success: false, message: "Couldn't load your connections." }, 500);
      const rows = (data ?? []) as any[];
      const others = [...new Set(rows.map((r) => (r.from_user === me ? r.to_user : r.from_user)))];
      const [profs, contacts] = await Promise.all([
        others.length ? db.from("network_profiles").select("user_id,display_name,industry,city,country,bio,offers").in("user_id", others) : Promise.resolve({ data: [] }),
        others.length ? db.from("network_contacts").select("user_id,whatsapp,email,website").in("user_id", others) : Promise.resolve({ data: [] }),
      ]);
      const pm = new Map(((profs as any).data ?? []).map((p: any) => [p.user_id, p]));
      const cm = new Map(((contacts as any).data ?? []).map((c: any) => [c.user_id, c]));
      return json({ success: true, connections: rows.map((r) => {
        const other = r.from_user === me ? r.to_user : r.from_user;
        return { id: r.id, direction: r.from_user === me ? "out" : "in", status: r.status, message: r.message, reason: r.match_reason,
          created_at: r.created_at, other: { user_id: other, ...(pm.get(other) as any ?? { display_name: "Nexora member" }) },
          contacts: r.status === "accepted" ? (cm.get(other) ?? null) : null };
      }) });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("[nexora-network]", e);
    return json({ success: false, message: "The partner network is unavailable right now." }, 500);
  }
});
