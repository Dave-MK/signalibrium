import { clerkClient } from "@clerk/nextjs/server";
import { readWorkspaceData } from "@/app/_lib/server/workspace-store";

export const runtime = "nodejs";

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyRequest(request: Request): Promise<{ ok: boolean; error?: string }> {
  const authorization = request.headers.get("authorization") ?? "";
  const apiKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const timestamp = request.headers.get("x-timestamp") ?? "";
  const signature = request.headers.get("x-signature") ?? "";

  if (!apiKey || !timestamp || !signature) {
    return { ok: false, error: "Missing authorization, x-timestamp, or x-signature header." };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, error: "Timestamp is missing or expired (±5 min window)." };
  }

  // Look up user by API key
  const clerk = await clerkClient();
  const userList = await clerk.users.getUserList({ limit: 500 });
  const matchedUser = userList.data.find((user) => {
    const storedKey = (user.privateMetadata as Record<string, unknown>)?.signalApiKey;
    return typeof storedKey === "string" && timingSafeEqual(storedKey, apiKey);
  });

  if (!matchedUser) {
    return { ok: false, error: "Invalid API key." };
  }

  const tier = (matchedUser.publicMetadata as Record<string, unknown>)?.tier;
  if (tier !== "algo") {
    return { ok: false, error: "Requires Algo plan." };
  }

  // Verify HMAC: hmac(apiKey, timestamp:GET:/api/signals)
  const expected = await hmacSha256(apiKey, `${timestamp}:GET:/api/signals`);
  if (!timingSafeEqual(signature, expected)) {
    return { ok: false, error: "Invalid signature." };
  }

  return { ok: true };
}

export async function GET(request: Request) {
  const { ok, error } = await verifyRequest(request);

  if (!ok) {
    return Response.json({ error }, { status: 401 });
  }

  const data = await readWorkspaceData();

  const activeSignals = data.predictionHistory
    .filter((p) => p.monitoringStatus === "Active")
    .map((p) => ({
      id: p.id,
      symbol: p.symbol,
      instrumentName: p.instrumentName,
      assetClass: p.assetClass,
      action: p.actionAtCall,
      decision: p.decisionAtCall,
      confidence: p.confidenceAtCall,
      horizon: p.horizon,
      entryLow: p.entryLowAtCall,
      entryHigh: p.entryHighAtCall,
      stop: p.stopPriceAtCall,
      target: p.targetPriceAtCall,
      calledAt: p.calledAt,
    }));

  const openTrades = data.siggiAccount.openTrades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    status: t.status,
    entryPrice: t.entryPrice,
    stopPrice: t.stopPrice,
    targetPrice: t.targetPrice,
    stopMode: t.stopMode,
    partialExitDone: t.partialExitDone,
    unrealizedPnlGbp: t.unrealizedPnlGbp,
    openedAt: t.openedAt,
  }));

  return Response.json({
    activeSignals,
    openTrades,
    syncedAt: new Date().toISOString(),
  });
}
