import { createClient } from "jsr:@supabase/supabase-js@2";

// Plans & billing through Paystack.
//  POST { action: 'config' }                              -> is checkout ready, currency, local monthly + yearly price for each plan, test mode?
//  POST { action: 'start', plan, interval?, return_url? } -> Paystack checkout link (interval 'month' (default) or 'year')
//  POST { action: 'verify', reference }                   -> confirms the payment with Paystack and activates the plan
//  (POST { plan } without an action still works as 'start', for older app versions.)
// Prices: NGN uses the fixed Naira prices in the plans table (price_ngn / price_ngn_year), USD uses price_usd / price_usd_year,
//   any other currency is converted from the USD price. Plans marked contact_sales (Organization) can't be bought here.
// Function secrets: PAYSTACK_SECRET_KEY (required; sk_test_... for testing, sk_live_... for real money)
//   optional PAYSTACK_CURRENCY (default NGN), optional PAYSTACK_USD_RATE (local currency per 1 USD, only used for currencies
//   other than NGN/USD; if not set, today's exchange rate is used); optional NEXORA_SITE_URLS (extra web addresses Paystack may return to).
//   The paystack-webhook function also activates plans, as a backup.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const DAY_MS = 86400000;
type Interval = "month" | "year";
const periodMs = (interval: Interval) => (interval === "year" ? 365 : 30) * DAY_MS;

let fx: { currency: string; rate: number; at: number } | null = null;
async function usdRate(currency: string): Promise<number> {
  if (currency === "USD" || currency === "NGN") return 1;   // fixed prices, no conversion
  const fixed = Number(Deno.env.get("PAYSTACK_USD_RATE"));
  if (fixed > 0) return fixed;
  if (fx && fx.currency === currency && Date.now() - fx.at < 6 * 3600000) return fx.rate;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const j = await r.json();
    const rate = Number(j?.rates?.[currency]);
    if (rate > 0) { fx = { currency, rate, at: Date.now() }; return rate; }
  } catch { /* fall through */ }
  return fx?.currency === currency ? fx.rate : 0;
}
// Plan price in the smallest unit (kobo for NGN, cents for USD), or null when it can't be bought in the app.
const priceMinor = (plan: any, interval: Interval, currency: string, rate: number): number | null => {
  if (plan.contact_sales) return null;
  const year = interval === "year";
  if (currency === "NGN") {
    const ngn = Number(year ? plan.price_ngn_year : plan.price_ngn);
    return ngn > 0 ? Math.round(ngn * 100) : null;
  }
  const usd = Number(year ? plan.price_usd_year : plan.price_usd);
  if (!(usd > 0)) return null;
  if (currency === "USD") return Math.round(usd * 100);
  if (!(rate > 0)) return null;
  return Math.ceil((usd * rate) / 10) * 10 * 100;   // tidy local amount
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    const currency = (Deno.env.get("PAYSTACK_CURRENCY") || "NGN").toUpperCase();
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud?.user?.email) return json({ success: false, message: "Please sign in again." }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : (body?.plan ? "start" : "config");

    const { data: plans } = await admin.from("plans").select("key,name,price_usd,price_ngn,price_usd_year,price_ngn_year,contact_sales").order("sort");
    const rate = secret ? await usdRate(currency) : 0;
    const ready = !!secret && rate > 0;

    if (action === "config") {
      const table = (interval: Interval) => Object.fromEntries((plans ?? []).map((p: any) => {
        const m = ready ? priceMinor(p, interval, currency, rate) : null;
        return [p.key, m === null ? null : m / 100];
      }));
      return json({
        success: true, ready, currency, test_mode: secret.startsWith("sk_test"),
        reason: !secret ? "no_key" : !rate ? "no_rate" : "",
        prices: table("month"), prices_year: table("year"),
      });
    }

    const { data: biz } = await admin.from("businesses").select("id,name,plan,subscription_status,current_period_end,paystack_reference").eq("owner_id", ud.user.id).maybeSingle();
    if (!biz) return json({ success: false, message: "Only the business owner can manage the plan. Create your company first." }, 403);

    if (action === "start") {
      if (!secret) return json({ success: false, code: "not_configured", message: "Payments aren't switched on yet. Add your Paystack secret key in Supabase (Edge Functions > Secrets > PAYSTACK_SECRET_KEY)." }, 503);
      if (!rate) return json({ success: false, code: "not_configured", message: "Couldn't get today's exchange rate. Set PAYSTACK_USD_RATE in Supabase function secrets." }, 503);
      const plan = (plans ?? []).find((p: any) => p.key === body.plan);
      if (!plan) return json({ success: false, message: "Unknown plan." }, 400);
      if (plan.contact_sales) return json({ success: false, message: `${plan.name} is priced for each organization. Contact our team for a quote.` }, 400);
      const interval: Interval = body.interval === "year" ? "year" : "month";
      const amount = priceMinor(plan, interval, currency, rate);
      if (amount === null) return json({ success: false, message: `${plan.name} isn't available ${interval === "year" ? "yearly" : "monthly"} in ${currency}.` }, 400);
      const ret = typeof body.return_url === "string" ? body.return_url : "";
      // Where Paystack may send the buyer back: nexorabusinessai.com (and www), any nexora*.vercel.app site, the sites listed in the optional
      // NEXORA_SITE_URLS secret (comma separated, e.g. a company domain), localhost, or the phone app.
      const extraSites = (Deno.env.get("NEXORA_SITE_URLS") || "").split(",").map((x) => x.trim().replace(/\/+$/, "").toLowerCase()).filter((x) => /^https:\/\/[a-z0-9.-]+$/.test(x));
      const retOrigin = (() => { try { return new URL(ret).origin.toLowerCase(); } catch { return ""; } })();
      const okReturn = /^https:\/\/nexora[a-z0-9-]*\.vercel\.app(\/|$)/i.test(ret) || /^https:\/\/(www\.)?nexorabusinessai\.com(\/|$)/i.test(ret) || (!!retOrigin && extraSites.includes(retOrigin)) || /^http:\/\/localhost(:\d+)?(\/|$)/i.test(ret) || /^nexora:\/\//i.test(ret);
      const reference = `nx_${biz.id.slice(0, 8)}_${Date.now()}`;
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ud.user.email, amount, currency, reference,
          ...(okReturn ? { callback_url: ret } : {}),
          metadata: {
            business_id: biz.id, plan: plan.key, interval,
            custom_fields: [{ display_name: "Nexora plan", variable_name: "plan", value: `${plan.name} (${interval === "year" ? "yearly" : "monthly"})` }],
          },
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.data?.authorization_url) {
        console.error("[paystack-checkout]", res.status, JSON.stringify(out).slice(0, 300));
        const msg = String(out?.message || "");
        return json({ success: false, message: /currency/i.test(msg) ? `Your Paystack account can't charge in ${currency}. Set PAYSTACK_CURRENCY to a currency your Paystack account supports.` : /key/i.test(msg) ? "Paystack rejected the secret key. Check PAYSTACK_SECRET_KEY in Supabase function secrets." : "We couldn't start the checkout. Please try again." }, 502);
      }
      await admin.from("businesses").update({ paystack_reference: reference }).eq("id", biz.id);
      return json({ success: true, url: out.data.authorization_url, reference, amount: amount / 100, currency, interval });
    }

    if (action === "verify") {
      const reference = typeof body.reference === "string" ? body.reference : biz.paystack_reference ?? "";
      if (!secret || !reference) return json({ success: true, status: "none" });
      if (reference.startsWith("paid:") || biz.paystack_reference === `paid:${reference}`) return json({ success: true, status: "active", plan: biz.plan, current_period_end: biz.current_period_end });
      if (biz.paystack_reference !== reference) return json({ success: true, status: "unknown" });
      const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const vj = await v.json().catch(() => ({}));
      const st = String(vj?.data?.status ?? "");
      if (!v.ok || st !== "success") return json({ success: true, status: st === "abandoned" || st === "" ? "pending" : st });   // failed / abandoned / pending
      const meta = vj.data.metadata ?? {};
      const plan = (plans ?? []).find((p: any) => p.key === meta.plan);
      if (!plan || meta.business_id !== biz.id) return json({ success: false, message: "This payment doesn't match your business. Contact support." }, 409);
      const interval: Interval = meta.interval === "year" ? "year" : "month";
      // Paid amount must cover the plan (rates can move a little between checkout and now).
      const expected = priceMinor(plan, interval, vj.data.currency || currency, rate || 1);
      if (expected === null || Number(vj.data.amount) < expected * 0.9) return json({ success: false, message: "The amount paid doesn't cover this plan. Contact support." }, 409);
      const from = Math.max(Date.now(), biz.current_period_end ? new Date(biz.current_period_end).getTime() : 0);
      const current_period_end = new Date(from + periodMs(interval)).toISOString();
      // Marking the reference as paid makes this safe to run twice (here and in the webhook).
      const { data: upd } = await admin.from("businesses").update({ plan: plan.key, subscription_status: "active", current_period_end, paystack_reference: `paid:${reference}` })
        .eq("id", biz.id).eq("paystack_reference", reference).select("id");
      if (!upd?.length) {
        const { data: now } = await admin.from("businesses").select("plan,current_period_end").eq("id", biz.id).maybeSingle();
        return json({ success: true, status: "active", plan: now?.plan, current_period_end: now?.current_period_end });
      }
      return json({ success: true, status: "active", plan: plan.key, plan_name: plan.name, interval, current_period_end });
    }

    return json({ success: false, message: "Unknown action." }, 400);
  } catch (e) {
    console.error("[paystack-checkout] unexpected", e);
    return json({ success: false, message: "An unexpected error occurred." }, 500);
  }
});
