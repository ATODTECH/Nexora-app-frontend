import { createClient } from "jsr:@supabase/supabase-js@2";

// Receives WhatsApp Cloud API, Messenger and Instagram messages from Meta, stores them in the owner's inbox,
// and (when the owner is away) lets the Nexora agent answer. Authenticated by Meta's HMAC signature, not a JWT.
// Meta app secrets needed: META_APP_SECRET, META_VERIFY_TOKEN. Optional: META_GRAPH_VERSION (default v23.0).
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey);
const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}`;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

type Secret = { user_id: string; access_token: string; external_id: string };
async function graphSend(channel: string, sec: Secret, to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const body = channel === "whatsapp"
    ? { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }
    : { recipient: { id: to }, messaging_type: "RESPONSE", message: { text: text.slice(0, 1900) } };
  const res = await fetch(`${GRAPH}/${sec.external_id}/messages`, { method: "POST", headers: { Authorization: `Bearer ${sec.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j?.error?.message || `HTTP ${res.status}` };
  return { ok: true, id: j?.messages?.[0]?.id || j?.message_id };
}

async function handle(ev: { channel: string; accountId: string; from: string; name?: string; mid: string; text: string }) {
  const { data: sec } = await admin.from("channel_secrets").select("user_id,access_token,external_id").eq("channel", ev.channel).eq("external_id", ev.accountId).maybeSingle();
  if (!sec) return;
  const owner = sec.user_id;
  const { data: blocked } = await admin.from("blocked_contacts").select("id").eq("user_id", owner).eq("channel", ev.channel).eq("external_id", ev.from).maybeSingle();
  if (blocked) return;

  let { data: conv } = await admin.from("conversations").select("*").eq("user_id", owner).eq("channel", ev.channel).eq("external_id", ev.from).maybeSingle();
  if (!conv) {
    let name = ev.name || "";
    if (!name && ev.channel !== "whatsapp") {
      try {
        const r = await fetch(`${GRAPH}/${ev.from}?fields=name,username&access_token=${encodeURIComponent(sec.access_token)}`);
        const j = await r.json();
        name = j?.name || j?.username || "";
      } catch { /* keep the id */ }
    }
    const created = await admin.from("conversations").insert({
      user_id: owner, channel: ev.channel, external_id: ev.from, name: name || ev.from, handle: ev.channel === "whatsapp" ? `+${ev.from}` : name, status: "AI can handle",
    }).select("*").single();
    conv = created.data;
  }
  if (!conv) return;

  const ins = await admin.from("conversation_messages").insert({ conversation_id: conv.id, user_id: owner, direction: "in", sender: "customer", text: ev.text, external_id: ev.mid });
  if (ins.error) return; // Meta retries deliveries: a duplicate id means we already stored this one
  await admin.from("conversations").update({ last_message: ev.text.slice(0, 200), last_message_at: new Date().toISOString(), unread: (conv.unread ?? 0) + 1 }).eq("id", conv.id);

  // ---- autopilot: only while the owner is away and the channel allows auto-reply ----
  const [{ data: prof }, { data: cc }] = await Promise.all([
    admin.from("profiles").select("is_away").eq("id", owner).maybeSingle(),
    admin.from("channel_connections").select("ai_behavior").eq("user_id", owner).eq("channel_key", ev.channel).maybeSingle(),
  ]);
  if (!prof?.is_away || (cc?.ai_behavior as any)?.autoReply === false) return;

  const { data: hist } = await admin.from("conversation_messages").select("sender,text").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(9);
  const history = (hist ?? []).reverse().slice(0, -1).map((m: any) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text }));
  const res = await fetch(`${url}/functions/v1/nexora-agent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json", "x-internal-owner": owner },
    body: JSON.stringify({ mode: "autopilot", message: ev.text, history, customer: { name: conv.name, channel: ev.channel, conversation_id: conv.id }, client_now: { date: new Date().toISOString().slice(0, 10) } }),
  });
  const out = await res.json().catch(() => ({}));
  // The plan's AI tasks are used up this month: the chat waits for the owner instead.
  if (out?.escalated || out?.code === "quota") await admin.from("conversations").update({ status: "Human attention" }).eq("id", conv.id);
  if (!out?.success || !out?.reply) return;

  if (!out.needs_approval) {
    const sent = await graphSend(ev.channel, sec, ev.from, out.reply);
    if (sent.ok) {
      await admin.from("conversation_messages").insert({ conversation_id: conv.id, user_id: owner, direction: "out", sender: "ai", text: out.reply, external_id: sent.id ?? null });
      await admin.from("conversations").update({ last_message: out.reply.slice(0, 200), last_message_at: new Date().toISOString(), unread: 0 }).eq("id", conv.id);
      return;
    }
    console.error("[meta-webhook] auto-reply failed", sent.error);
  }
  await admin.from("conversations").update({ ai_suggestion: out.reply }).eq("id", conv.id); // owner approves it in the app
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const token = Deno.env.get("META_VERIFY_TOKEN");
    if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = "sha256=" + hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (sig !== req.headers.get("x-hub-signature-256")) return new Response("Bad signature", { status: 401 });

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }
  const events: { channel: string; accountId: string; from: string; name?: string; mid: string; text: string }[] = [];
  for (const entry of payload?.entry ?? []) {
    if (payload.object === "whatsapp_business_account") {
      for (const ch of entry?.changes ?? []) {
        const v = ch?.value ?? {};
        const names: Record<string, string> = {};
        for (const c of v.contacts ?? []) names[c.wa_id] = c?.profile?.name;
        for (const m of v.messages ?? []) {
          events.push({ channel: "whatsapp", accountId: v?.metadata?.phone_number_id, from: m.from, name: names[m.from], mid: m.id, text: m.type === "text" ? (m.text?.body ?? "") : `[${m.type} message]` });
        }
      }
    } else if (payload.object === "page" || payload.object === "instagram") {
      for (const m of entry?.messaging ?? []) {
        if (!m?.message || m.message.is_echo) continue;
        events.push({ channel: payload.object === "page" ? "facebook" : "instagram", accountId: m.recipient?.id, from: m.sender?.id, mid: m.message.mid, text: m.message.text ?? "[attachment]" });
      }
    }
  }
  const work = (async () => { for (const ev of events) { try { await handle(ev); } catch (e) { console.error("[meta-webhook]", e); } } })();
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
  return new Response("ok", { status: 200 });
});
