export async function GET() {
  const redisUrl = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  const checks = {
    redis: false,
    redisUrl: !!redisUrl,
    redisToken: !!redisToken,
  };

  if (redisUrl && redisToken) {
    try {
      const url = redisUrl.replace(/\/$/, "");
      const response = await fetch(`${url}/ping`, {
        method: "GET",
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => null);
      checks.redis = response.ok && body?.result === "PONG";
    } catch (error) {
      console.error("Redis health check failed:", error);
    }
  }

  if (!checks.redisUrl || !checks.redisToken) {
    console.error("FATAL: Redis credentials not set. App is running on ephemeral storage.");
  }

  const ok = checks.redis && checks.redisUrl && checks.redisToken;

  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
