import {
  generateSignalApiKey,
  getUserSignalApiKey,
  requireAuthUser,
} from "@/app/_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — returns the current user's Signal API key (null if none generated yet).
 * POST — generates (or rotates) the key and returns the new value.
 * Both require authentication only — tier is managed separately via
 * /api/admin/enable-api-access.
 */
export async function GET() {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const key = await getUserSignalApiKey(user.userId);
  return Response.json({ apiKey: key });
}

export async function POST() {
  let user;
  try {
    user = await requireAuthUser();
  } catch {
    return Response.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const key = await generateSignalApiKey(user.userId);
  return Response.json({ apiKey: key });
}
