/**
 * Phase 14 — Open the Stripe customer billing portal.
 *
 * The portal natively handles cancellation, payment-method updates and
 * invoice history. We create a short-lived portal session server-side and
 * return its URL; the client only ever receives a redirect target.
 */
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

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

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = sub?.stripe_customer_id;
    if (!customerId) {
      return json({ error: "no billing account yet — start a checkout first" }, 400);
    }

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#/billing`,
    });

    await supabase.from("billing_events").insert({
      user_id: user.id,
      kind: "portal_opened",
      detail: "customer portal",
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("billing-portal failed", err);
    return json({ error: "could not open billing portal" }, 500);
  }
});
