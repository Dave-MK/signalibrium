import { generateSignalApiKey, getUserSignalApiKey, requireTier } from "@/app/_lib/auth";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await requireTier("algo");
  } catch {
    return Response.json({ error: "Requires Algo plan." }, { status: 403 });
  }

  const key = await getUserSignalApiKey(user.userId);
  return Response.json({ apiKey: key });
}

export async function POST() {
  let user;
  try {
    user = await requireTier("algo");
  } catch {
    return Response.json({ error: "Requires Algo plan." }, { status: 403 });
  }

  const key = await generateSignalApiKey(user.userId);
  return Response.json({ apiKey: key });
}
