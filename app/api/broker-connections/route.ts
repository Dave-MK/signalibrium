/**
 * GET  /api/broker-connections — list all broker connections (no secrets returned)
 * POST /api/broker-connections — create a new connection and store credentials
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { storeBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { verifyBrokerCredential } from "@/app/_lib/server/broker-api";
import {
  createBrokerConnection,
  deleteBrokerConnection,
  listBrokerConnections,
} from "@/app/_lib/server/repositories/broker-connections";
import type { BrokerEnvironment, BrokerProvider } from "@/app/_lib/server/workspace-types";

export async function GET() {
  try {
    await requireAuthUser();
    const connections = await listBrokerConnections();
    return NextResponse.json({ connections });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  let connectionId: string | null = null;

  try {
    const user = await requireAuthUser();
    const body = await request.json() as Record<string, unknown>;

    const provider = body.provider as BrokerProvider;
    const environment = body.environment as BrokerEnvironment;
    const apiKey = body.apiKey as string;
    const apiSecret = body.apiSecret as string | undefined;
    const label = body.label as string;

    // OAuth-only providers are handled by /api/broker-connections/oauth/*
    const apiKeyProviders: BrokerProvider[] = ["Binance", "Kraken"];
    const oauthProviders:  BrokerProvider[] = ["Alpaca", "OANDA"];
    const validProviders  = [...apiKeyProviders, ...oauthProviders];

    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
    }

    if (environment !== "demo" && environment !== "live") {
      return NextResponse.json({ error: "Invalid environment." }, { status: 400 });
    }

    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }

    // Providers that require both key + secret
    const needsSecret: BrokerProvider[] = ["Alpaca", "Binance", "Kraken"];
    if (needsSecret.includes(provider) && (typeof apiSecret !== "string" || apiSecret.trim().length === 0)) {
      return NextResponse.json(
        { error: `${provider} requires both an API key and a secret key.` },
        { status: 400 },
      );
    }

    const credential = {
      provider,
      apiKey: apiKey.trim(),
      ...(apiSecret?.trim() ? { apiSecret: apiSecret.trim() } : {}),
    };

    // Verify credentials before storing anything
    const verifyResult = await verifyBrokerCredential(provider, environment, credential);

    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: verifyResult.error ?? "Credential verification failed." },
        { status: 422 },
      );
    }

    const connectionLabel =
      typeof label === "string" && label.trim().length > 0
        ? label.trim()
        : `${provider} ${environment === "live" ? "Live" : "Demo"}`;

    // Step 1: Create the KV record (no secrets)
    const connection = await createBrokerConnection({
      provider,
      environment,
      label: connectionLabel,
      accountRef: verifyResult.accountRef ?? null,
      status: "connected",
    });
    connectionId = connection.id;

    // Step 2: Store credentials in Clerk. If this fails, clean up the KV record
    // so we never leave an orphaned connection without credentials.
    try {
      await storeBrokerCredential(user.userId, connection.id, credential);
    } catch (clerkError) {
      console.error("[broker-connections POST] Clerk credential storage failed — rolling back KV connection:", clerkError);
      await deleteBrokerConnection(connection.id).catch(() => {});
      throw new Error("Failed to store credentials securely. Please try again.");
    }

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    console.error("[broker-connections POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect broker." },
      { status: 500 },
    );
  }
}
