/**
 * Unified broker API — server-side entry point.
 *
 * Routes to the correct adapter based on provider:
 *   Alpaca  — OAuth Bearer token or legacy API key+secret
 *   OANDA   — OAuth Bearer token or legacy personal access token
 *   Binance — API key + HMAC-SHA256 signed requests
 *   Kraken  — API key + HMAC-SHA512 signed requests
 *   IBKR    — stub (coming soon)
 */

import type { BrokerEnvironment, BrokerProvider } from "../workspace-types";
import type { StoredBrokerCredential } from "../broker-credentials";
import { verifyAlpacaCredentials, fetchAlpacaAccount, type AlpacaAccountData } from "./alpaca";
import {
  verifyOandaCredentials,
  fetchOandaAccount,
  fetchOandaAccountAutoDiscover,
  type OandaAccountData,
} from "./oanda";
import { verifyBinanceCredentials, fetchBinanceAccount, type BinanceAccountData } from "./binance";
import { verifyKrakenCredentials, fetchKrakenAccount, type KrakenAccountData } from "./kraken";
import {
  submitAlpacaOrder,
  submitOandaOrder,
  submitBinanceOrder,
  submitKrakenOrder,
  type BrokerOrderRequest,
  type BrokerOrderResult,
} from "./orders";
import {
  fetchAlpacaPositions,
  fetchOandaPositions,
  fetchBinancePositions,
  fetchKrakenPositions,
  type BrokerPosition,
  type BrokerPositionsResult,
} from "./positions";
import {
  fetchAlpacaOrderStatus,
  fetchOandaOrderStatus,
  fetchBinanceOrderStatus,
  fetchKrakenOrderStatus,
  type OrderStatusResult,
} from "./order-status";

export type { BrokerOrderRequest, BrokerOrderResult, BrokerPosition, BrokerPositionsResult, OrderStatusResult };

export type { AlpacaAccountData, OandaAccountData, BinanceAccountData, KrakenAccountData };

export type BrokerVerifyResult =
  | { valid: true; accountRef: string }
  | { valid: false; error: string };

export type BrokerAccountData =
  | AlpacaAccountData
  | OandaAccountData
  | BinanceAccountData
  | KrakenAccountData
  | { provider: "IBKR"; error: "not_implemented" };

export async function verifyBrokerCredential(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
  credential: StoredBrokerCredential,
): Promise<BrokerVerifyResult> {
  if (provider === "Alpaca") {
    if (!credential.accessToken && (!credential.apiKey || !credential.apiSecret)) {
      return { valid: false, error: "Alpaca requires an OAuth token or both API key and secret." };
    }
    const result = await verifyAlpacaCredentials(credential, environment);
    if (result.valid) return { valid: true, accountRef: result.accountRef ?? "" };
    return { valid: false, error: result.error ?? "Verification failed." };
  }

  if (provider === "OANDA") {
    if (!credential.accessToken && !credential.apiKey) {
      return { valid: false, error: "OANDA requires an OAuth token or personal access token." };
    }
    const result = await verifyOandaCredentials(credential, environment);
    if (result.valid) return { valid: true, accountRef: result.accountRef ?? "" };
    return { valid: false, error: result.error ?? "Verification failed." };
  }

  if (provider === "Binance") {
    const result = await verifyBinanceCredentials(credential);
    if (result.valid) return { valid: true, accountRef: result.accountRef ?? "SPOT" };
    return { valid: false, error: result.error ?? "Verification failed." };
  }

  if (provider === "Kraken") {
    const result = await verifyKrakenCredentials(credential);
    if (result.valid) return { valid: true, accountRef: result.accountRef ?? "kraken-spot" };
    return { valid: false, error: result.error ?? "Verification failed." };
  }

  return { valid: false, error: "IBKR direct connection is coming soon." };
}

export async function fetchBrokerAccount(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
  credential: StoredBrokerCredential,
  accountRef: string | null,
): Promise<BrokerAccountData> {
  if (provider === "Alpaca") {
    return fetchAlpacaAccount(credential, environment);
  }

  if (provider === "OANDA") {
    if (accountRef) return fetchOandaAccount(credential, environment, accountRef);
    return fetchOandaAccountAutoDiscover(credential, environment);
  }

  if (provider === "Binance") {
    return fetchBinanceAccount(credential);
  }

  if (provider === "Kraken") {
    return fetchKrakenAccount(credential);
  }

  return { provider: "IBKR", error: "not_implemented" };
}

export async function submitBrokerOrder(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
  credential: StoredBrokerCredential,
  request: BrokerOrderRequest,
): Promise<BrokerOrderResult> {
  if (provider === "Alpaca") return submitAlpacaOrder(request, credential, environment);
  if (provider === "OANDA")  return submitOandaOrder(request, credential, environment);
  if (provider === "Binance") return submitBinanceOrder(request, credential);
  if (provider === "Kraken")  return submitKrakenOrder(request, credential);
  throw new Error("Order submission is not yet available for IBKR.");
}

export async function fetchBrokerOrderStatus(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
  credential: StoredBrokerCredential,
  orderId: string,
  symbol: string,
  accountRef: string | null,
): Promise<OrderStatusResult> {
  if (provider === "Alpaca")  return fetchAlpacaOrderStatus(orderId, credential, environment);
  if (provider === "OANDA")   return fetchOandaOrderStatus(orderId, credential, environment, accountRef);
  if (provider === "Binance") return fetchBinanceOrderStatus(orderId, symbol, credential);
  if (provider === "Kraken")  return fetchKrakenOrderStatus(orderId, credential);
  throw new Error("Order status polling is not yet available for IBKR.");
}

export async function fetchBrokerPositions(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
  credential: StoredBrokerCredential,
  accountRef: string | null,
): Promise<BrokerPositionsResult> {
  if (provider === "Alpaca")  return fetchAlpacaPositions(credential, environment);
  if (provider === "OANDA")   return fetchOandaPositions(credential, environment, accountRef ?? "");
  if (provider === "Binance") return fetchBinancePositions(credential);
  if (provider === "Kraken")  return fetchKrakenPositions(credential);
  return { provider: "IBKR" as never, positions: [], fetchedAt: new Date().toISOString() };
}
