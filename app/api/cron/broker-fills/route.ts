/**
 * GET /api/cron/broker-fills
 *
 * Vercel Cron target — runs every minute.
 * Polls each connected broker for fills on pending trade tickets and
 * updates their status (Submitted/Working → Filled).
 *
 * Also refreshes the status of open Siggi broker orders.
 *
 * Security: same CRON_SECRET guard as other cron routes.
 */

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { fetchBrokerOrderStatus } from "@/app/_lib/server/broker-api";
import {
  listBrokerConnections,
} from "@/app/_lib/server/repositories/broker-connections";
import {
  listTradeTickets,
  applyBrokerResultToTicket,
} from "@/app/_lib/server/repositories/trade-tickets";
import { readWorkspaceData, writeWorkspaceData } from "@/app/_lib/server/workspace-store";
import type { PersistedSiggiTrade } from "@/app/_lib/server/workspace-types";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

async function getOwnerUserId(): Promise<string | null> {
  try {
    const clerk = await clerkClient();
    const result = await clerk.users.getUserList({ limit: 1, orderBy: "-created_at" });
    return result.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getOwnerUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Could not resolve workspace owner." }, { status: 500 });
  }

  const connections = await listBrokerConnections();
  const connected   = connections.filter((c) => c.status === "connected");

  if (connected.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, updated: 0 });
  }

  // Build credential map keyed by connection id
  const credMap = new Map(
    await Promise.all(
      connected.map(async (c) => [c.id, await getBrokerCredential(userId, c.id).catch(() => null)] as const),
    ),
  );

  let updated = 0;
  let checked = 0;

  // ── Trade ticket fills ─────────────────────────────────────────────────────
  const tickets = await listTradeTickets();
  const pendingTickets = tickets.filter(
    (t) =>
      (t.status === "Submitted" || t.status === "Working") &&
      t.brokerReference &&
      t.brokerConnectionId,
  );

  for (const ticket of pendingTickets) {
    const conn = connected.find((c) => c.id === ticket.brokerConnectionId);
    if (!conn) continue;
    const cred = credMap.get(conn.id);
    if (!cred) continue;

    try {
      checked++;
      const status = await fetchBrokerOrderStatus(
        conn.provider,
        conn.environment,
        cred,
        ticket.brokerReference!,
        ticket.symbol,
        conn.accountRef,
      );

      if (status.status !== mapTicketToOrderStatus(ticket.status)) {
        await applyBrokerResultToTicket(ticket.id, {
          orderId:        status.orderId,
          status:         status.status,
          filledQuantity: status.filledQuantity,
          filledPrice:    status.filledPrice,
        });
        updated++;
      }
    } catch (err) {
      console.error(`[broker-fills] ticket ${ticket.id} poll failed:`, err);
    }
  }

  // ── Siggi live order confirmation ──────────────────────────────────────────
  const data = await readWorkspaceData();
  let siggiUpdated = false;

  for (const trade of data.siggiAccount.openTrades) {
    if (!trade.brokerOrderId || !trade.brokerConnectionId) continue;
    const conn = connected.find((c) => c.id === trade.brokerConnectionId);
    if (!conn) continue;
    const cred = credMap.get(conn.id);
    if (!cred) continue;

    try {
      checked++;
      const status = await fetchBrokerOrderStatus(
        conn.provider,
        conn.environment,
        cred,
        trade.brokerOrderId,
        trade.symbol,
        conn.accountRef,
      );

      // If the broker reports it filled, stamp the actual fill price onto the trade
      if (status.status === "filled" && status.filledPrice) {
        const idx = data.siggiAccount.openTrades.findIndex((t) => t.id === trade.id);
        if (idx !== -1) {
          data.siggiAccount.openTrades[idx] = {
            ...data.siggiAccount.openTrades[idx],
            entryPrice: status.filledPrice,
          } as PersistedSiggiTrade;
          siggiUpdated = true;
          updated++;
        }
      }
    } catch (err) {
      console.error(`[broker-fills] siggi trade ${trade.id} poll failed:`, err);
    }
  }

  if (siggiUpdated) {
    await writeWorkspaceData(data);
  }

  return NextResponse.json({ ok: true, checked, updated });
}

function mapTicketToOrderStatus(
  ticketStatus: string,
): "submitted" | "working" | "filled" | "pending" {
  if (ticketStatus === "Submitted") return "submitted";
  if (ticketStatus === "Working" || ticketStatus === "Partially Closed") return "working";
  if (ticketStatus === "Filled" || ticketStatus === "Closed") return "filled";
  return "pending";
}
