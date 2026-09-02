/**
 * Phase 14 — Create a Stripe Checkout session for a paid plan.
 *
 * Runs with the SERVICE ROLE key (never exposed to the browser). The client
 * sends only a `plan_id`; the Stripe price id is resolved HERE so pricing
 * logic stays server-side. The caller's identity is verified from their JWT —
 * we never trust a client-supplied user id.
 */
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

/** plan_id -> Stripe price id (server-side, centralized). */
const PRICE_IDS: Record<string, string> = {
  researcher: Deno.env.get("STRIPE_PRICE_RESEARCHER") ?? "",
  pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authenticate the caller from their JWT.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { plan_id } = await req.json().catch(() => ({}));
    const priceId = PRICE_IDS[String(plan_id)];
    if (!priceId) return json({ error: "unknown or free plan" }, 400);

    // Find or create the Stripe customer for this auth user.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, plan_id: String(plan_id) },
      subscription_data: { metadata: { user_id: user.id, plan_id: String(plan_id) } },
      success_url: `${origin}/#/billing?checkout=success`,
      cancel_url: `${origin}/#/billing?checkout=canceled`,
    });

    await supabase.from("billing_events").insert({
      user_id: user.id,
      kind: "checkout_started",
      detail: String(plan_id),
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout failed", err);
    return json({ error: "could not start checkout" }, 500);
  }
});
