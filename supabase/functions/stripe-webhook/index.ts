/**
 * Phase 14 — Stripe webhook receiver.
 *
 * This is the ONLY writer of `subscriptions`. It:
 *   1. Verifies the Stripe signature (rejects forged events).
 *   2. Maps Stripe events -> subscription state + billing_events.
 *
 * The client never touches `subscriptions`; it only reads the row this
 * function maintains. That is what makes plan status trustworthy.
 */
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

/** Reverse map: Stripe price id -> plan_id. */
const PLAN_BY_PRICE: Record<string, string> = {
  [Deno.env.get("STRIPE_PRICE_RESEARCHER") ?? "__"]: "researcher",
  [Deno.env.get("STRIPE_PRICE_PRO") ?? "__"]: "pro",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function statusFromStripe(s: string): string {
  return ["active", "trialing", "past_due", "canceled", "incomplete"].includes(s) ? s : "active";
}

async function logEvent(userId: string, kind: string, detail = "") {
  await supabase.from("billing_events").insert({ user_id: userId, kind, detail });
}

/** Persist the subscription row from a Stripe subscription object. */
async function syncSubscription(sub: Stripe.Subscription, fallbackUserId?: string) {
  const userId =
    (sub.metadata?.user_id as string | undefined) ?? fallbackUserId ?? null;
  if (!userId) {
    console.error("subscription missing user_id metadata", sub.id);
    return;
  }
  const priceId = sub.items.data[0]?.price.id ?? "";
  const planId = PLAN_BY_PRICE[priceId] ?? "free";

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: String(sub.customer),
      stripe_subscription_id: sub.id,
      plan_id: planId,
      status: statusFromStripe(sub.status),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
  return { userId, planId };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // Throws unless the signature is genuine — forged events are rejected here.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature ?? "", webhookSecret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? (session.metadata?.user_id as string | undefined);
        if (session.subscription && userId) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          const synced = await syncSubscription(sub, userId);
          if (synced) await logEvent(synced.userId, "subscription_activated", synced.planId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const prev = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
        const synced = await syncSubscription(sub);
        if (synced) {
          const priceChanged =
            prev?.items !== undefined || prev?.cancel_at_period_end !== undefined;
          await logEvent(
            synced.userId,
            priceChanged ? "plan_changed" : "renewed",
            synced.planId,
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.user_id as string | undefined) ?? null;
        if (userId) {
          await supabase.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_subscription_id: sub.id,
              plan_id: "free",
              status: "canceled",
              cancel_at_period_end: false,
            },
            { onConflict: "user_id" },
          );
          await logEvent(userId, "canceled", "reverted to free");
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const synced = await syncSubscription(sub);
          if (synced) {
            await supabase
              .from("subscriptions")
              .update({ status: "past_due" })
              .eq("user_id", synced.userId);
            await logEvent(synced.userId, "payment_failed", "invoice not paid");
          }
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged but ignored.
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook processing failed", err);
    return new Response("processing error", { status: 500 });
  }
});
