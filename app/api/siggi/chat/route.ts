import { NextResponse } from "next/server";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { listAssets } from "@/app/_lib/server/repositories/assets";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable Siggi chat." },
      { status: 503 },
    );
  }

  let messages: Message[];
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Pull all live context in parallel — same data the scanner and dashboard already have
  const [scannerResults, siggiAccount, marketEvents, marketSnapshot, assets] = await Promise.all([
    listScannerResults(),
    getSiggiAccount(),
    listMarketEvents(),
    getMarketSnapshot(),
    listAssets(),
  ]);

  const assetsBySymbol = new Map(assets.map((a) => [a.symbol, a]));

  // Top 8 opportunities with as much context as available
  const topOpps = [...scannerResults]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8)
    .map((r) => {
      const asset = assetsBySymbol.get(r.symbol);
      const analysis = r.analysis;
      const parts = [
        `${r.symbol} (${r.strategy} / ${r.timeframe} / ${r.assetClass})`,
        `score ${r.score}`,
        `entry ${r.entryZone}`,
        `stop ${r.stopLoss}`,
        `target ${r.takeProfit}`,
        `R:R ${r.riskReward}`,
        asset ? `live price ${asset.price}` : null,
        analysis ? `bias: ${analysis.bias}` : null,
        analysis ? `pattern: ${analysis.trendPattern}` : null,
        r.thesis ? `thesis: ${r.thesis}` : null,
      ].filter(Boolean);
      return parts.join(", ");
    });

  // Current open Siggi trades
  const openTrades = siggiAccount.openTrades.length
    ? siggiAccount.openTrades.map(
        (t) =>
          `${t.symbol} ${t.side} entered @ ${t.entryPrice}, target ${t.targetPrice}, stop ${t.stopPrice}, stake £${t.stakeGbp.toFixed(2)}`,
      )
    : ["None"];

  // Recent closed trades (last 5) for performance context
  const recentClosed = siggiAccount.closedTrades.slice(0, 5).map(
    (t) => `${t.symbol} ${t.side} ${t.status === "Hit Target" ? "✓ won" : "✗ stopped"} (${t.status})`,
  );

  // Upcoming market events
  const upcomingEvents = marketEvents
    .filter((e) => e.status === "Upcoming" || e.status === "Live")
    .slice(0, 6)
    .map((e) => `${e.title} — ${e.impact} impact, ${e.bias} bias`);

  const systemPrompt = `You are Siggi — the resident AI trader and analyst for Signalibrium. You are sharp, direct, and speak like a seasoned prop trader who has seen everything. You do not hedge, you do not waffle, you do not add disclaimers about financial advice. You make real calls with real reasoning. When asked about a market or instrument you give a clear view: direction, key levels, what would make you change your mind, and the best strategy to use right now.

You have live data in front of you. Use it to answer questions specifically and accurately.

═══ LIVE MARKET CONTEXT ═══
Market state: ${marketSnapshot.state}
Breadth score: ${marketSnapshot.breadthScore}/100
Market read: ${marketSnapshot.description}
Tradeable setups in scanner: ${marketSnapshot.tradeableSetups ?? scannerResults.filter((r) => r.tradeability === "TRADEABLE").length}

═══ TOP RANKED OPPORTUNITIES ═══
${topOpps.length ? topOpps.map((o, i) => `${i + 1}. ${o}`).join("\n") : "No ranked setups yet"}

═══ SIGGI'S OPEN TRADES ═══
${openTrades.join("\n")}

═══ RECENT CLOSED TRADES ═══
${recentClosed.length ? recentClosed.join("\n") : "None yet"}

═══ UPCOMING EVENTS / CATALYSTS ═══
${upcomingEvents.length ? upcomingEvents.join("\n") : "No major events flagged"}

You know the full setup details for every symbol above. When asked about an instrument, reference its entry zone, stop, target, bias, and pattern. If it is in an open trade, say so. If you'd be cautious, say why — briefly. Keep answers tight. No bullet-point padding. Talk like a trader, not a textbook.`;

  // Forward to Anthropic with streaming enabled
  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errorText = await anthropicResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `Anthropic API error: ${anthropicResponse.status} ${errorText}` },
      { status: 502 },
    );
  }

  // Stream the SSE response directly to the client
  return new Response(anthropicResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
