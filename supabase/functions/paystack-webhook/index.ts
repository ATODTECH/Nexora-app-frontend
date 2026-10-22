import { createClient } from "jsr:@supabase/supabase-js@2";

// Paystack calls this URL after a payment (backup for the app's own check after checkout).
// Set it in the Paystack dashboard: Settings > API Keys & Webhooks > Webhook URL =
//   https://evevvwlglxzeoamvcodx.supabase.co/functions/v1/paystack-webhook
// No JWT: the request is authenticated by Paystack's HMAC signature, then re-checked against Paystack's verify API.
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const DAY_MS = 86400000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (sig !== req.headers.get("x-paystack-signature")) return new Response("Bad signature", { status: 401 });

  try {
    const event = JSON.parse(raw);
    if (event?.event !== "charge.success") return new Response("ignored", { status: 200 });
    const reference = String(event?.data?.reference ?? "");
    const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const vj = await v.json().catch(() => ({}));
    if (!v.ok || vj?.data?.status !== "success") return new Response("not verified", { status: 200 });
    const meta = vj.data.metadata ?? {};
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: biz } = await admin.from("businesses").select("id,paystack_reference,current_period_end").eq("id", meta.business_id).maybeSingle();
    if (!biz) return new Response("unknown business", { status: 200 });
    if (biz.paystack_reference === `paid:${reference}`) return new Response("already applied", { status: 200 });
    if (biz.paystack_reference !== reference) return new Response("unknown reference", { status: 200 });
    const { data: plan } = await admin.from("plans").select("key,contact_sales").eq("key", meta.plan).maybeSingle();
    if (!plan || plan.contact_sales) return new Response("unknown plan", { status: 200 });
    const days = meta.interval === "year" ? 365 : 30;
    const from = Math.max(Date.now(), biz.current_period_end ? new Date(biz.current_period_end).getTime() : 0);
    await admin.from("businesses").update({
      plan: plan.key, subscription_status: "active", current_period_end: new Date(from + days * DAY_MS).toISOString(), paystack_reference: `paid:${reference}`,
    }).eq("id", biz.id).eq("paystack_reference", reference);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[paystack-webhook]", e);
    return new Response("error", { status: 500 });
  }
});
