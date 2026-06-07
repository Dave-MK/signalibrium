// ─── Stripe billing — not active ────────────────────────────────────────────
// Stripe checkout is commented out while billing is not yet configured.
// To re-enable: add STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_ALGO_PRICE_ID
// to .env.local and uncomment the implementation below.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { error: "Billing is not yet configured. Reach out directly to upgrade your plan." },
    { status: 503 },
  );
}

/*
import Stripe from "stripe";
import { requireAuthUser } from "@/app/_lib/auth";

const TIER_PRICE_MAP: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  algo: process.env.STRIPE_ALGO_PRICE_ID,
};

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Billing is not configured." }, { status: 503 });
  }

  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const { tier } = (await request.json()) as { tier?: string };
  const priceId = tier ? TIER_PRICE_MAP[tier] : undefined;

  if (!priceId) {
    return Response.json({ error: "Invalid tier." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true`,
    cancel_url: `${appUrl}/billing?cancelled=true`,
    metadata: { userId: user.userId, tier: tier ?? "" },
  });

  return Response.json({ url: session.url });
}
*/
