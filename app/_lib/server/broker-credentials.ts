/**
 * Broker credential storage — server-only.
 *
 * API keys are stored exclusively in Clerk's encrypted `privateMetadata`.
 * They are NEVER written to KV/Redis, NEVER returned to the browser, and
 * NEVER logged. This module must not be imported from any client-side code.
 *
 * Storage shape inside Clerk privateMetadata:
 *   {
 *     signalApiKey: "...",               // existing key — preserved
 *     brokerCredentials: {               // added by this module
 *       [connectionId]: {
 *         provider: "Alpaca" | "OANDA" | "Binance" | "Kraken" | "IBKR",
 *         // OAuth credentials (preferred — set by OAuth flow, no user key entry)
 *         accessToken?: string,
 *         refreshToken?: string,
 *         tokenExpiresAt?: string,       // ISO timestamp
 *         // Legacy API key (manual entry fallback)
 *         apiKey?: string,
 *         apiSecret?: string,            // Alpaca only
 *       }
 *     }
 *   }
 *
 * IMPORTANT: We always read the full privateMetadata before writing so that
 * we never accidentally wipe peer keys (e.g. signalApiKey). Clerk's SDK may
 * shallow-merge or replace at the privateMetadata level depending on version —
 * we defend against both by always spreading the full existing object.
 */

import { clerkClient } from "@clerk/nextjs/server";
import type { BrokerProvider } from "./workspace-types";

export type StoredBrokerCredential = {
  provider: BrokerProvider;
  // OAuth tokens (set by the OAuth flow — preferred)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  // Legacy API key (manual entry fallback)
  apiKey?: string;
  apiSecret?: string;
};

/** Read the entire privateMetadata object (not just brokerCredentials). */
async function readFullPrivateMeta(userId: string): Promise<Record<string, unknown>> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const meta = user.privateMetadata as Record<string, unknown>;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
}

function extractCredentialMap(meta: Record<string, unknown>): Record<string, unknown> {
  const map = meta.brokerCredentials;
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  return map as Record<string, unknown>;
}

export async function storeBrokerCredential(
  userId: string,
  connectionId: string,
  credential: StoredBrokerCredential,
): Promise<void> {
  const clerk = await clerkClient();
  // Read full existing metadata so we preserve signalApiKey and any other top-level keys
  const fullMeta = await readFullPrivateMeta(userId);
  const existingCredentials = extractCredentialMap(fullMeta);

  await clerk.users.updateUser(userId, {
    privateMetadata: {
      // Spread all existing top-level keys (e.g. signalApiKey) so they are NOT wiped
      ...fullMeta,
      brokerCredentials: {
        ...existingCredentials,
        [connectionId]: {
          provider: credential.provider,
          // OAuth tokens (preferred — never logged or returned to browser)
          ...(credential.accessToken ? { accessToken: credential.accessToken } : {}),
          ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {}),
          ...(credential.tokenExpiresAt ? { tokenExpiresAt: credential.tokenExpiresAt } : {}),
          // Legacy API key
          ...(credential.apiKey ? { apiKey: credential.apiKey } : {}),
          ...(credential.apiSecret ? { apiSecret: credential.apiSecret } : {}),
        },
      },
    },
  });
}

export async function getBrokerCredential(
  userId: string,
  connectionId: string,
): Promise<StoredBrokerCredential | null> {
  const fullMeta = await readFullPrivateMeta(userId);
  const map = extractCredentialMap(fullMeta);
  const raw = map[connectionId];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const entry = raw as Record<string, unknown>;
  const provider = entry.provider;

  if (
    provider !== "Alpaca"  &&
    provider !== "OANDA"   &&
    provider !== "Binance" &&
    provider !== "Kraken"  &&
    provider !== "IBKR"
  ) {
    return null;
  }

  const accessToken =
    typeof entry.accessToken === "string" && entry.accessToken.length > 0
      ? entry.accessToken
      : undefined;
  const apiKey =
    typeof entry.apiKey === "string" && entry.apiKey.length > 0
      ? entry.apiKey
      : undefined;

  // Must have at least one auth mechanism
  if (!accessToken && !apiKey) return null;

  return {
    provider,
    ...(accessToken ? { accessToken } : {}),
    ...(typeof entry.refreshToken === "string" && entry.refreshToken.length > 0
      ? { refreshToken: entry.refreshToken }
      : {}),
    ...(typeof entry.tokenExpiresAt === "string" ? { tokenExpiresAt: entry.tokenExpiresAt } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(typeof entry.apiSecret === "string" && entry.apiSecret.length > 0
      ? { apiSecret: entry.apiSecret }
      : {}),
  };
}

export async function deleteBrokerCredential(
  userId: string,
  connectionId: string,
): Promise<void> {
  const clerk = await clerkClient();
  const fullMeta = await readFullPrivateMeta(userId);
  const existingCredentials = extractCredentialMap(fullMeta);
  const { [connectionId]: _removed, ...rest } = existingCredentials;
  void _removed;

  await clerk.users.updateUser(userId, {
    privateMetadata: {
      ...fullMeta,
      brokerCredentials: rest,
    },
  });
}
