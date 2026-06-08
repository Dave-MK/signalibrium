import { NextResponse } from "next/server";
import { requireAuthUser, setUserTier } from "@/app/_lib/auth";
import { generateSignalApiKey } from "@/app/_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/enable-api-access
 *
 * Self-service endpoint: promotes the current authenticated user to "algo"
 * tier and generates their first API key if they don't have one yet.
 * Safe to call multiple times — idempotent on tier promotion.
 */
export async function POST() {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  await setUserTier(user.userId, "algo");
  const key = await generateSignalApiKey(user.userId);

  return NextResponse.json({ ok: true, apiKey: key });
}
