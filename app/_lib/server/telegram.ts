/**
 * Telegram notification utility for Siggi alerts.
 *
 * Setup:
 * 1. Message @BotFather on Telegram → /newbot → copy the token
 * 2. Message your new bot, then visit:
 *    https://api.telegram.org/bot<TOKEN>/getUpdates
 *    Copy the "id" value from chat.id in the response
 * 3. Add to Vercel env vars:
 *    TELEGRAM_BOT_TOKEN=<token>
 *    TELEGRAM_CHAT_ID=<chat_id>
 */

const TELEGRAM_API = "https://api.telegram.org";

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

/**
 * Send a plain or HTML-formatted message to your Telegram chat.
 * Silently no-ops if credentials aren't configured.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const config = getConfig();
  if (!config) return;

  try {
    await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Non-fatal — never let a notification failure break the sync
  }
}

/** Test the connection — returns true if the message was accepted by Telegram */
export async function testTelegramConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig();
  if (!config) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: "✅ <b>Signalibrium connected</b>\n\nSiggi will now send alerts here when he opens or closes a trade.",
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(8000),
    });

    const body = await response.json() as { ok: boolean; description?: string };
    return body.ok ? { ok: true } : { ok: false, error: body.description };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
  }
}

// ─── Message formatters ───────────────────────────────────────────────────────

function fmt(value: number, decimals = 2) {
  return value.toFixed(decimals);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${fmt(value, 1)}%`;
}

function rr(entry: number, stop: number, target: number): string {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return "—";
  return `${fmt(reward / risk, 1)}R`;
}

export function formatTradeOpenedMessage(trade: {
  symbol: string;
  instrumentName: string;
  side: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stakeGbp: number;
  confidenceAtOpen: number;
  narrative: string;
  strategy?: string;
  timeframe?: string;
}): string {
  const dir = trade.side === "SELL" ? "SHORT ▼" : "LONG ▲";
  const stopPct = ((trade.stopPrice - trade.entryPrice) / trade.entryPrice) * 100;
  const targetPct = ((trade.targetPrice - trade.entryPrice) / trade.entryPrice) * 100;
  const rrLabel = rr(trade.entryPrice, trade.stopPrice, trade.targetPrice);
  const stratLine = trade.strategy ? `\n📋 <i>${trade.strategy}${trade.timeframe ? ` · ${trade.timeframe}` : ""}</i>` : "";

  return [
    `🟢 <b>SIGGI OPENED — ${trade.symbol}</b>`,
    `${dir} · ${trade.instrumentName}${stratLine}`,
    ``,
    `Entry:  <b>${fmt(trade.entryPrice, 4)}</b>`,
    `Stop:   ${fmt(trade.stopPrice, 4)} <i>(${pct(stopPct)})</i>`,
    `Target: ${fmt(trade.targetPrice, 4)} <i>(${pct(targetPct)})</i>`,
    ``,
    `R:R ${rrLabel} · Confidence ${trade.confidenceAtOpen}% · Stake £${fmt(trade.stakeGbp)}`,
  ].join("\n");
}

export function formatTradeClosedMessage(trade: {
  symbol: string;
  instrumentName: string;
  side: string;
  status: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  realizedPnlGbp: number | null;
  openedAt: string;
  closedAt: string | null;
}): string {
  const isWin = trade.status === "Hit Target";
  const isBE  = trade.status === "Breakeven";
  const emoji = isWin ? "✅" : isBE ? "⚖️" : "❌";
  const label = isWin ? "WIN" : isBE ? "BREAKEVEN" : "LOSS";
  const pnl   = trade.realizedPnlGbp ?? 0;
  const pnlStr = pnl >= 0 ? `+£${fmt(pnl)}` : `-£${fmt(Math.abs(pnl))}`;

  // Held duration
  let heldStr = "";
  if (trade.closedAt) {
    const ms = Date.parse(trade.closedAt) - Date.parse(trade.openedAt);
    const h  = Math.floor(ms / 3_600_000);
    const m  = Math.floor((ms % 3_600_000) / 60_000);
    heldStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const exitPrice = trade.status === "Hit Target" ? trade.targetPrice : trade.stopPrice;

  return [
    `${emoji} <b>SIGGI CLOSED — ${trade.symbol} · ${label}</b>`,
    `${trade.side === "SELL" ? "SHORT" : "LONG"} · ${trade.instrumentName}`,
    ``,
    `Exit:  <b>${fmt(exitPrice, 4)}</b>  (entered ${fmt(trade.entryPrice, 4)})`,
    `P&L:   <b>${pnlStr}</b>${heldStr ? `  ·  Held ${heldStr}` : ""}`,
  ].join("\n");
}

export function formatPriceAlertMessage(alert: {
  symbol: string;
  label: string;
  condition: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}): string {
  const dir = alert.condition === "above" ? "▲ crossed above" : "▼ crossed below";
  return [
    `🔔 <b>PRICE ALERT — ${alert.symbol}</b>`,
    `${alert.label}`,
    ``,
    `${dir} <b>${fmt(alert.targetPrice, 4)}</b>`,
    `Current price: ${fmt(alert.currentPrice, 4)}`,
  ].join("\n");
}

export function formatDailyLossLimitMessage(params: {
  limitPercent: number;
  dropPercent: number;
  startEquityGbp: number;
  currentEquityGbp: number;
}): string {
  return [
    `⛔ <b>SIGGI — DAILY LOSS LIMIT HIT</b>`,
    ``,
    `Limit:    ${fmt(params.limitPercent, 1)}%  of start-of-day equity`,
    `Drawdown: ${fmt(params.dropPercent, 1)}%`,
    ``,
    `Start:   £${fmt(params.startEquityGbp)}`,
    `Current: £${fmt(params.currentEquityGbp)}`,
    ``,
    `<i>Siggi has paused new trades for the rest of the day.</i>`,
  ].join("\n");
}

export function formatEnterNowMessage(signal: {
  symbol: string;
  instrumentName: string;
  action: string;
  entryZone: string;
  stopLoss: string;
  takeProfit: string;
  strategy: string;
  timeframe: string;
  score: number;
}): string {
  return [
    `⚡ <b>ENTER NOW — ${signal.symbol}</b>`,
    `${signal.action === "Sell" ? "SHORT ▼" : "LONG ▲"} · ${signal.instrumentName}`,
    `📋 <i>${signal.strategy} · ${signal.timeframe}</i>`,
    ``,
    `Entry:  <b>${signal.entryZone}</b>`,
    `Stop:   ${signal.stopLoss}`,
    `Target: ${signal.takeProfit}`,
    `Score:  ${signal.score}`,
  ].join("\n");
}
