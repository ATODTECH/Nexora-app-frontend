import { createClient } from "jsr:@supabase/supabase-js@2";

// Connects a business's real WhatsApp / Facebook / Instagram accounts.
//  POST (signed-in owner): { action: 'whatsapp', phone_number_id, access_token } | { action: 'facebook', page_id, access_token }
//                          | { action: 'oauth_start' } | { action: 'disconnect', channel }
//  GET  (Facebook redirects here after the owner approves): ?code=...&state=...
// Secrets: META_APP_ID, META_APP_SECRET (needed for OAuth). Optional: META_GRAPH_VERSION (default v23.0).
// A new connection must fit the plan's connected accounts (reconnecting the same account always works).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}`;
const REDIRECT = `${url}/functions/v1/channel-connect`;
const SCOPES = "pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages";
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const page = (title: string, msg: string, ok: boolean) => new Response(
  `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,Roboto,sans-serif;text-align:center;padding:48px 24px;color:#0B1220"><div style="font-size:56px">${ok ? "✅" : "⚠️"}</div><h2>${title}</h2><p style="color:#5C6B7A">${msg}</p><p style="color:#5C6B7A">You can close this window and return to Nexora AI.</p></body>`,
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("META_APP_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function saveConnection(userId: string, channel: string, externalId: string, token: string, display: string, handle: string) {
  const { data: clash } = await admin.from("channel_secrets").select("user_id").eq("channel", channel).eq("external_id", externalId).maybeSingle();
  if (clash && clash.user_id !== userId) throw new Error("That account is already connected to a different Nexora business.");
  // Plan limit: a newly connected account must fit the plan (checked before anything is saved).
  const { data: cur } = await admin.from("channel_connections").select("connected").eq("user_id", userId).eq("channel_key", channel).maybeSingle();
  if (!cur?.connected) {
    const { data: lim } = await admin.rpc("check_plan_limit", { p_user: userId, p_kind: "connected_accounts" });
    if (lim?.ok === false) throw new Error(String(lim.message || "Your plan's connected accounts are all in use. Upgrade to connect more."));
  }
  const s = await admin.from("channel_secrets").upsert({ user_id: userId, channel, external_id: externalId, access_token: token, display_name: display }, { onConflict: "user_id,channel" });
  if (s.error) throw new Error("Couldn't save the connection.");
  await admin.from("channel_connections").upsert({ user_id: userId, channel_key: channel, connected: true, handle, connected_at: new Date().toISOString() }, { onConflict: "user_id,channel_key" });
}

async function connectPages(userId: string, userToken: string): Promise<string> {
  const r = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`);
  const j = await r.json();
  const p = j?.data?.[0];
  if (!p) throw new Error("No Facebook Page was found on that account. Create or get access to a Page, then try again.");
  await saveConnection(userId, "facebook", p.id, p.access_token, p.name, p.name);
  // subscribe this Page to message events so new messages reach our webhook
  await fetch(`${GRAPH}/${p.id}/subscribed_apps`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks", access_token: p.access_token }) }).catch(() => {});
  const ig = p.instagram_business_account;
  if (ig?.id) await saveConnection(userId, "instagram", ig.id, p.access_token, ig.username || p.name, ig.username ? `@${ig.username}` : p.name);
  return ig?.id ? `${p.name} (Facebook) and @${ig.username} (Instagram)` : `${p.name} (Facebook)`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const u = new URL(req.url);

  /* ---------- OAuth callback from Facebook ---------- */
  if (req.method === "GET") {
    try {
      const code = u.searchParams.get("code"), state = u.searchParams.get("state") ?? "";
      if (u.searchParams.get("error")) return page("Connection cancelled", "You didn't approve access, so nothing was connected.", false);
      const [uid, exp, sig] = state.split(".");
      if (!code || !uid || !exp || sig !== (await sign(`${uid}.${exp}`)) || Number(exp) < Date.now()) return page("This link expired", "Start the connection again from Nexora AI.", false);
      const id = Deno.env.get("META_APP_ID"), secret = Deno.env.get("META_APP_SECRET");
      if (!id || !secret) return page("Not set up", "Facebook login isn't configured for Nexora yet.", false);
      const t1 = await (await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: REDIRECT, code })}`)).json();
      if (!t1?.access_token) return page("Couldn't connect", "Facebook didn't accept the approval. Please try again.", false);
      const t2 = await (await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: t1.access_token })}`)).json();
      const label = await connectPages(uid, t2?.access_token || t1.access_token);
      return page("Connected", `${label} is now linked to Nexora AI.`, true);
    } catch (e) {
      console.error("[channel-connect] callback", e);
      return page("Couldn't connect", (e as Error).message || "Something went wrong.", false);
    }
  }

  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud?.user) return json({ success: false, message: "Please sign in again." }, 401);
    const userId = ud.user.id;
    const { data: biz } = await asUser.from("businesses").select("id").eq("owner_id", userId).maybeSingle();
    if (!biz) return json({ success: false, message: "Only a business owner can connect channels." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "oauth_start") {
      const id = Deno.env.get("META_APP_ID");
      if (!id || !Deno.env.get("META_APP_SECRET")) return json({ success: false, message: "Facebook login isn't set up yet. The Nexora team still needs to add the Meta app keys." }, 503);
      const exp = Date.now() + 15 * 60_000;
      const state = `${userId}.${exp}.${await sign(`${userId}.${exp}`)}`;
      const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT, state, scope: SCOPES, response_type: "code" });
      return json({ success: true, url: `https://www.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}/dialog/oauth?${q}` });
    }

    if (action === "whatsapp") {
      const pid = typeof body?.phone_number_id === "string" ? body.phone_number_id.trim() : "";
      const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
      if (!/^\d{6,20}$/.test(pid) || token.length < 20) return json({ success: false, message: "Enter your WhatsApp Phone Number ID and access token." }, 400);
      const r = await fetch(`${GRAPH}/${pid}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ success: false, message: j?.error?.message ? `WhatsApp said: ${j.error.message}` : "WhatsApp didn't accept those details." }, 400);
      await saveConnection(userId, "whatsapp", pid, token, j.verified_name || "", j.display_phone_number || pid);
      return json({ success: true, handle: j.display_phone_number || pid });
    }

    if (action === "facebook") {
      const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
      if (token.length < 20) return json({ success: false, message: "Enter your Page access token." }, 400);
      const label = await connectPages(userId, token);
      return json({ success: true, label });
    }

    if (action === "disconnect") {
      const ch = body?.channel;
      if (!["whatsapp", "instagram", "facebook"].includes(ch)) return json({ success: false, message: "Unknown channel." }, 400);
      await admin.from("channel_secrets").delete().eq("user_id", userId).eq("channel", ch);
      await admin.from("channel_connections").upsert({ user_id: userId, channel_key: ch, connected: false, handle: "" }, { onConflict: "user_id,channel_key" });
      return json({ success: true });
    }
    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("[channel-connect]", e);
    return json({ success: false, message: (e as Error).message || "An unexpected error occurred." }, 500);
  }
});
