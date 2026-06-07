// ─── Stripe webhook — not active ────────────────────────────────────────────
// Stripe webhook is commented out while billing is not yet configured.
// To re-enable: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env.local
// and uncomment the implementation below.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ received: false, reason: "Billing not configured." }, { status: 503 });
}

/*
import Stripe from "stripe";
import { setUserTier } from "@/app/_lib/auth";
import type { UserTier } from "@/app/_lib/auth";

const PRICE_TIER_MAP: Record<string, UserTier> = {
  [process.env.STRIPE_PRO_PRICE_ID ?? "price_pro"]: "pro",
  [process.env.STRIPE_ALGO_PRICE_ID ?? "price_algo"]: "algo",
};

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Billing not configured." }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tier = (session.metadata?.tier as UserTier | undefined) ?? "pro";

    if (userId && (tier === "pro" || tier === "algo")) {
      await setUserTier(userId, tier);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const priceId = sub.items.data[0]?.price.id;
    const userId = sub.metadata?.userId;

    if (userId && priceId && PRICE_TIER_MAP[priceId]) {
      await setUserTier(userId, "free");
    }
  }

  return Response.json({ received: true });
}
*/
