/**
 * Siggi broker execution — server-only.
 *
 * When a broker connection has `autoExecuteSiggi: true`, every trade that
 * Siggi opens or closes in simulation is mirrored as a real order on the
 * connected broker.
 *
 * Called from sync-market-data.ts after syncSiggiAccount runs so we can
 * diff the account state before/after and pick up net-new opens/closes.
 *
 * Security: credentials are read from Clerk privateMetadata via
 * getBrokerCredential — they are never logged or returned to the browser.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { getBrokerCredential } from "./broker-credentials";
import { submitBrokerOrder } from "./broker-api";
import type { PersistedWorkspaceData, PersistedSiggiTrade } from "./workspace-types";

// ─── Owner user ID (single-tenant) ────────────────────────────────────────────

let cachedOwnerUserId: string | null = null;

async function getWorkspaceOwnerUserId(): Promise<string | null> {
  if (cachedOwnerUserId) return cachedOwnerUserId;
  try {
    const clerk = await clerkClient();
    const result = await clerk.users.getUserList({ limit: 1, orderBy: "-created_at" });
    const userId = result.data[0]?.id ?? null;
    if (userId) cachedOwnerUserId = userId;
    return userId;
  } catch {
    return null;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * After syncSiggiAccount has run and mutated `data.siggiAccount`, call this
 * to mirror any net-new trade opens/closes as real broker orders.
 *
 * Errors from the broker are caught and logged — they never abort the sync.
 */
export async function executeSiggiBrokerOrders(
  data: PersistedWorkspaceData,
  openTradeIdsBefore: Set<string>,
  closedTradeIdsBefore: Set<string>,
): Promise<void> {
  // Find the broker designated for Siggi auto-execution
  const connection = data.brokerConnections.find(
    (c) => c.status === "connected" && c.autoExecuteSiggi === true,
  );
  if (!connection) return; // no broker linked to Siggi — paper mode only

  const userId = await getWorkspaceOwnerUserId();
  if (!userId) {
    console.warn("[siggi-broker] Could not resolve workspace owner user ID — skipping execution.");
    return;
  }

  const credential = await getBrokerCredential(userId, connection.id).catch(() => null);
  if (!credential) {
    console.warn(`[siggi-broker] No credential found for connection ${connection.id} — skipping.`);
    return;
  }

  // ── Newly opened trades ────────────────────────────────────────────────────
  const newlyOpened = data.siggiAccount.openTrades.filter(
    (t) => !openTradeIdsBefore.has(t.id),
  );

  for (const trade of newlyOpened) {
    try {
      const result = await submitBrokerOrder(
        connection.provider,
        connection.environment,
        credential,
        {
          symbol:       trade.symbol,
          side:         trade.side === "BUY" ? "buy" : "sell",
          type:         "market",
          quantity:     trade.quantity,
          accountRef:   connection.accountRef,
        },
      );

      // Stamp the trade with broker reference (mutation is safe — data hasn't been written yet)
      const idx = data.siggiAccount.openTrades.findIndex((t) => t.id === trade.id);
      if (idx !== -1) {
        data.siggiAccount.openTrades[idx] = {
          ...data.siggiAccount.openTrades[idx],
          brokerConnectionId: connection.id,
          brokerOrderId:      result.orderId,
        } as PersistedSiggiTrade;
      }

      console.info(
        `[siggi-broker] Opened ${trade.side} ${trade.quantity} ${trade.symbol} → order ${result.orderId} (${result.status})`,
      );
    } catch (err) {
      console.error(`[siggi-broker] Failed to open ${trade.symbol}:`, err);
    }
  }

  // ── Newly closed trades ────────────────────────────────────────────────────
  const newlyClosed = data.siggiAccount.closedTrades.filter(
    (t) => !closedTradeIdsBefore.has(t.id),
  );

  for (const trade of newlyClosed) {
    // Only close if we have a broker order for this trade (i.e. it was opened live)
    if (!trade.brokerConnectionId || !trade.brokerOrderId) continue;

    try {
      const closeSide = trade.side === "BUY" ? "sell" : "buy";
      const result = await submitBrokerOrder(
        connection.provider,
        connection.environment,
        credential,
        {
          symbol:       trade.symbol,
          side:         closeSide,
          type:         "market",
          quantity:     trade.quantity,
          accountRef:   connection.accountRef,
        },
      );

      // Stamp close order ID
      const idx = data.siggiAccount.closedTrades.findIndex((t) => t.id === trade.id);
      if (idx !== -1) {
        data.siggiAccount.closedTrades[idx] = {
          ...data.siggiAccount.closedTrades[idx],
          brokerCloseOrderId: result.orderId,
        } as PersistedSiggiTrade;
      }

      console.info(
        `[siggi-broker] Closed ${trade.symbol} (${trade.status}) → close order ${result.orderId} (${result.status})`,
      );
    } catch (err) {
      console.error(`[siggi-broker] Failed to close ${trade.symbol}:`, err);
    }
  }
}
