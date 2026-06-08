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
