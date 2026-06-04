import {
  getMarketDataAssetDefinition,
  listMarketDataAssetDefinitions,
} from "../market-data/asset-catalog";
import type { PersistedTradeTicket } from "../workspace-types";

type IgEnvironment = "demo" | "live";

type IgConfig = {
  accountId?: string;
  apiKey: string;
  baseUrl: string;
  identifier: string;
  password: string;
};

type IgSession = {
  accountId: string;
  cst: string;
  securityToken: string;
  expiresAt: number;
};

type IgErrorPayload = {
  errorCode?: string;
  message?: string;
};

type IgSessionResponse = IgErrorPayload & {
  accounts?: Array<{
    accountId?: string;
    preferred?: boolean;
  }>;
  currentAccountId?: string;
};

type IgMarketSearchResult = {
  delayTime?: number;
  epic?: string;
  expiry?: string;
  instrumentName?: string;
  instrumentType?: string;
  marketStatus?: string;
};

type IgMarketSearchResponse = IgErrorPayload & {
  markets?: IgMarketSearchResult[];
};

type IgMarketDetailsResponse = IgErrorPayload & {
  instrument?: {
    currencies?: Array<{
      code?: string;
      isDefault?: boolean;
    }>;
    epic?: string;
    expiry?: string;
    marketId?: string;
    name?: string;
  };
  snapshot?: {
    marketStatus?: string;
  };
};

type IgDealResponse = IgErrorPayload & {
  dealReference?: string;
};

type IgDealConfirmationResponse = IgErrorPayload & {
  affectedDeals?: Array<{
    dealId?: string;
    status?: string;
  }>;
  date?: string;
  dealId?: string;
  dealReference?: string;
  dealStatus?: "ACCEPTED" | "REJECTED";
  direction?: string;
  epic?: string;
  level?: number;
  profit?: number;
  reason?: string;
  size?: number;
  status?: string;
};

type IgOpenPositionsResponse = IgErrorPayload & {
  positions?: Array<{
    market?: {
      epic?: string;
      instrumentName?: string;
    };
    position?: {
      createdDate?: string;
      createdDateUTC?: string;
      currency?: string;
      dealId?: string;
      dealReference?: string;
      direction?: "BUY" | "SELL";
      level?: number;
      limitLevel?: number;
      size?: number;
      stopLevel?: number;
    };
  }>;
};

type IgWorkingOrdersResponse = IgErrorPayload & {
  workingOrders?: Array<{
    marketData?: {
      epic?: string;
      instrumentName?: string;
    };
    workingOrderData?: {
      createdDate?: string;
      createdDateUTC?: string;
      currencyCode?: string;
      dealId?: string;
      dealReference?: string;
      direction?: "BUY" | "SELL";
      epic?: string;
      goodTillDate?: string;
      level?: number;
      limitLevel?: number;
      orderType?: "LIMIT" | "STOP";
      size?: number;
      stopLevel?: number;
      timeInForce?: "GOOD_TILL_CANCELLED" | "GOOD_TILL_DATE";
    };
  }>;
};

type IgMarketMeta = {
  currencyCode: string;
  epic: string;
  expiry: string;
  marketStatus: string;
  name: string;
};

type BrokerExecutionUpdate = {
  brokerDealId: string | null;
  brokerReference: string;
  brokerStatus: PersistedTradeTicket["brokerStatus"];
  executedEntry: number | null;
  executedQuantity: number | null;
  filledAt: string | null;
  note: string | null;
  status: PersistedTradeTicket["status"];
  submittedAt: string;
};

type BrokerCancellationUpdate = {
  brokerReference: string;
  brokerStatus: PersistedTradeTicket["brokerStatus"];
  note: string | null;
  status: PersistedTradeTicket["status"];
};

type BrokerCloseUpdate = {
  brokerReference: string;
  brokerStatus: PersistedTradeTicket["brokerStatus"];
  closedAt: string;
  executedEntry: number | null;
  note: string | null;
  realizedPnl: number | null;
  status: PersistedTradeTicket["status"];
};

export type IgSyncedOpenPosition = {
  createdAt: string | null;
  currency: string | null;
  dealId: string;
  dealReference: string | null;
  direction: "BUY" | "SELL";
  epic: string;
  level: number;
  limitLevel: number | null;
  name: string | null;
  size: number;
  stopLevel: number | null;
  symbol: string;
};

export type IgSyncedWorkingOrder = {
  createdAt: string | null;
  currency: string | null;
  dealId: string;
  dealReference: string | null;
  direction: "BUY" | "SELL";
  epic: string;
  level: number;
  limitLevel: number | null;
  name: string | null;
  orderType: "LIMIT" | "STOP";
  size: number;
  stopLevel: number | null;
  symbol: string;
  timeInForce: "GOOD_TILL_CANCELLED" | "GOOD_TILL_DATE" | null;
};

export type IgBrokerSyncSnapshot = {
  accountId: string;
  fetchedAt: string;
  positions: IgSyncedOpenPosition[];
  workingOrders: IgSyncedWorkingOrder[];
};

const sessionTtlMs = 11 * 60 * 60 * 1000;
const epicCache = new Map<string, string>();
const sessionPromiseCache = new Map<string, Promise<IgSession>>();
const sessionCache = new Map<string, IgSession>();

function normalizeComparableValue(value: string) {
  return value.replace(/[^A-Z0-9]+/g, "").trim();
}

function buildIgError(payload: unknown, fallbackMessage: string) {
  const candidate = (payload ?? {}) as IgErrorPayload;
  return candidate.errorCode ?? candidate.message ?? fallbackMessage;
}

function parseIgTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const directTimestamp = Date.parse(value);

  if (Number.isFinite(directTimestamp)) {
    return new Date(directTimestamp).toISOString();
  }

  const normalized = value.replace(/\//g, "-").replace(" ", "T");
  const utcCandidate = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  const utcTimestamp = Date.parse(utcCandidate);

  if (Number.isFinite(utcTimestamp)) {
    return new Date(utcTimestamp).toISOString();
  }

  return null;
}

function resolveQuoteCurrency(
  currencies:
    | Array<{
        code?: string;
        isDefault?: boolean;
      }>
    | undefined,
) {
  const defaultCurrency = currencies?.find((currency) => currency.isDefault);
  return defaultCurrency?.code ?? currencies?.[0]?.code ?? "USD";
}

function getBaseUrl(environment: IgEnvironment) {
  return environment === "live"
    ? "https://api.ig.com/gateway/deal"
    : "https://demo-api.ig.com/gateway/deal";
}

function readEnvironmentVariable(
  environment: IgEnvironment,
  suffix: "API_KEY" | "IDENTIFIER" | "PASSWORD" | "ACCOUNT_ID" | "BASE_URL",
) {
  const explicitEnvironmentVariable = process.env[
    `SIGNALIBRIUM_IG_${environment.toUpperCase()}_${suffix}`
  ]?.trim();

  if (explicitEnvironmentVariable) {
    return explicitEnvironmentVariable;
  }

  const genericEnvironment =
    process.env.SIGNALIBRIUM_IG_ENVIRONMENT?.trim().toLowerCase() ?? "demo";

  if (genericEnvironment === environment) {
    return process.env[`SIGNALIBRIUM_IG_${suffix}`]?.trim();
  }

  return undefined;
}

function getIgConfig(environment: IgEnvironment): IgConfig {
  const apiKey = readEnvironmentVariable(environment, "API_KEY");
  const identifier = readEnvironmentVariable(environment, "IDENTIFIER");
  const password = readEnvironmentVariable(environment, "PASSWORD");
  const accountId = readEnvironmentVariable(environment, "ACCOUNT_ID");
  const explicitBaseUrl = readEnvironmentVariable(environment, "BASE_URL");
  const missingVariables: string[] = [];

  if (!apiKey) {
    missingVariables.push(`SIGNALIBRIUM_IG_${environment.toUpperCase()}_API_KEY`);
  }

  if (!identifier) {
    missingVariables.push(`SIGNALIBRIUM_IG_${environment.toUpperCase()}_IDENTIFIER`);
  }

  if (!password) {
    missingVariables.push(`SIGNALIBRIUM_IG_${environment.toUpperCase()}_PASSWORD`);
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `IG ${environment} dealing is not configured. Add ${missingVariables.join(", ")} to your local environment.`,
    );
  }

  return {
    accountId,
    apiKey: apiKey!,
    baseUrl: explicitBaseUrl || getBaseUrl(environment),
    identifier: identifier!,
    password: password!,
  };
}

function buildSessionKey(environment: IgEnvironment, config: IgConfig) {
  return `${environment}:${config.baseUrl}:${config.identifier}:${config.accountId ?? "default"}`;
}

function clearCachedSession(sessionKey: string) {
  sessionCache.delete(sessionKey);
  sessionPromiseCache.delete(sessionKey);
}

async function createIgSession(environment: IgEnvironment) {
  const config = getIgConfig(environment);
  const response = await fetch(`${config.baseUrl}/session`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=UTF-8",
      "Content-Type": "application/json; charset=UTF-8",
      Version: "1",
      "X-IG-API-KEY": config.apiKey,
    },
    body: JSON.stringify({
      identifier: config.identifier,
      password: config.password,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as IgSessionResponse;

  if (!response.ok) {
    throw new Error(buildIgError(payload, `IG ${environment} session login failed.`));
  }

  const cst = response.headers.get("CST");
  const securityToken = response.headers.get("X-SECURITY-TOKEN");
  const accountId =
    config.accountId ||
    payload.currentAccountId ||
    payload.accounts?.find((account) => account.preferred)?.accountId ||
    payload.accounts?.[0]?.accountId;

  if (!cst || !securityToken || !accountId) {
    throw new Error(
      `IG ${environment} session login succeeded but did not return the required dealing tokens.`,
    );
  }

  const session: IgSession = {
    accountId,
    cst,
    securityToken,
    expiresAt: Date.now() + sessionTtlMs,
  };

  const sessionKey = buildSessionKey(environment, config);
  sessionCache.set(sessionKey, session);
  return session;
}

async function getIgSession(environment: IgEnvironment) {
  const config = getIgConfig(environment);
  const sessionKey = buildSessionKey(environment, config);
  const cachedSession = sessionCache.get(sessionKey);

  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession;
  }

  const cachedPromise = sessionPromiseCache.get(sessionKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  const nextPromise = createIgSession(environment).finally(() => {
    sessionPromiseCache.delete(sessionKey);
  });

  sessionPromiseCache.set(sessionKey, nextPromise);
  return nextPromise;
}

async function fetchIgJson<T>(
  environment: IgEnvironment,
  pathname: string,
  {
    authenticated = true,
    body,
    method = "GET",
    retry = true,
    version = "1",
  }: {
    authenticated?: boolean;
    body?: unknown;
    method?: "DELETE" | "GET" | "POST";
    retry?: boolean;
    version?: string;
  } = {},
) {
  const config = getIgConfig(environment);
  const sessionKey = buildSessionKey(environment, config);
  const headers = new Headers({
    Accept: "application/json; charset=UTF-8",
    "Content-Type": "application/json; charset=UTF-8",
    Version: version,
    "X-IG-API-KEY": config.apiKey,
  });

  if (authenticated) {
    const session = await getIgSession(environment);
    headers.set("CST", session.cst);
    headers.set("X-SECURITY-TOKEN", session.securityToken);
    headers.set("IG-ACCOUNT-ID", session.accountId);
  }

  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & IgErrorPayload;

  if (!response.ok) {
    const isAuthFailure =
      authenticated && (response.status === 401 || response.status === 403 || response.status === 504);

    if (retry && isAuthFailure) {
      clearCachedSession(sessionKey);
      return fetchIgJson<T>(environment, pathname, {
        authenticated,
        body,
        method,
        retry: false,
        version,
      });
    }

    throw new Error(buildIgError(payload, `IG request failed for ${pathname}.`));
  }

  return payload;
}

function scoreMarketMatch(
  symbol: string,
  market: IgMarketSearchResult,
  searchTerm: string,
  prefersShares: boolean,
) {
  const epic = normalizeComparableValue(market.epic?.toUpperCase() ?? "");
  const name = normalizeComparableValue(market.instrumentName?.toUpperCase() ?? "");
  const marketType = normalizeComparableValue(market.instrumentType?.toUpperCase() ?? "");
  const expiry = normalizeComparableValue(market.expiry?.toUpperCase() ?? "");
  const normalizedSymbol = normalizeComparableValue(symbol.toUpperCase());
  const normalizedSearchTerm = normalizeComparableValue(searchTerm.toUpperCase());

  let score = 0;

  if (epic === normalizedSearchTerm || epic === normalizedSymbol) {
    score += 140;
  }

  if (name === normalizedSearchTerm || name === normalizedSymbol) {
    score += 120;
  }

  if (name.includes(normalizedSearchTerm) || name.includes(normalizedSymbol)) {
    score += 65;
  }

  if (epic.includes(normalizedSymbol)) {
    score += 40;
  }

  if (market.marketStatus === "TRADEABLE") {
    score += 6;
  }

  if (expiry === "" || expiry === "-" || expiry === "DFB" || expiry === "TODAY") {
    score += 10;
  }

  if (prefersShares && marketType.includes("SHARES")) {
    score += 8;
  }

  return score;
}

async function resolveMarketEpic(symbol: string, environment: IgEnvironment) {
  const cacheKey = `${environment}:${symbol.toUpperCase()}`;
  const cachedEpic = epicCache.get(cacheKey);

  if (cachedEpic) {
    return cachedEpic;
  }

  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No IG market mapping is configured for ${symbol.toUpperCase()}.`);
  }

  if (definition.igEpic) {
    epicCache.set(cacheKey, definition.igEpic);
    return definition.igEpic;
  }

  for (const searchTerm of definition.searchTerms) {
    const response = await fetchIgJson<IgMarketSearchResponse>(
      environment,
      `/markets?searchTerm=${encodeURIComponent(searchTerm)}`,
      { version: "1" },
    );
    const matchedMarket = [...(response.markets ?? [])]
      .sort(
        (left, right) =>
          scoreMarketMatch(definition.symbol, right, searchTerm, Boolean(definition.proxyNote)) -
          scoreMarketMatch(definition.symbol, left, searchTerm, Boolean(definition.proxyNote)),
      )
      .find((market) => Boolean(market.epic));

    if (matchedMarket?.epic) {
      epicCache.set(cacheKey, matchedMarket.epic);
      return matchedMarket.epic;
    }
  }

  throw new Error(
    `IG could not resolve a market epic for ${definition.symbol}. Add SIGNALIBRIUM_IG_EPIC_${definition.symbol}=... to your local environment to pin the correct market.`,
  );
}

async function getIgMarketMeta(symbol: string, environment: IgEnvironment): Promise<IgMarketMeta> {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No IG market mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const epic = await resolveMarketEpic(definition.symbol, environment);
  const response = await fetchIgJson<IgMarketDetailsResponse>(
    environment,
    `/markets/${encodeURIComponent(epic)}`,
    { version: "3" },
  );

  return {
    currencyCode: resolveQuoteCurrency(response.instrument?.currencies),
    epic: response.instrument?.epic ?? epic,
    expiry: response.instrument?.expiry ?? "DFB",
    marketStatus: response.snapshot?.marketStatus ?? "UNKNOWN",
    name: response.instrument?.name ?? definition.symbol,
  };
}

function buildDealReference(prefix: string, ticket: PersistedTradeTicket) {
  return `${prefix}-${ticket.symbol.toLowerCase()}-${ticket.id.slice(0, 6)}-${Date.now().toString(36).slice(-4)}`.slice(0, 30);
}

function mapPositionOrderType(orderType: PersistedTradeTicket["orderType"]) {
  return orderType === "Limit" ? "LIMIT" : "MARKET";
}

function mapWorkingOrderType(orderType: PersistedTradeTicket["orderType"]) {
  return orderType === "Stop Entry" ? "STOP" : "LIMIT";
}

function mapPositionTimeInForce(timeInForce: PersistedTradeTicket["timeInForce"]) {
  return timeInForce === "IOC" ? "EXECUTE_AND_ELIMINATE" : "FILL_OR_KILL";
}

function buildGoodTillDate() {
  const now = new Date();
  const endOfDayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 0, 0),
  );
  return endOfDayUtc.toISOString().slice(0, 19);
}

async function fetchDealConfirmation(environment: IgEnvironment, dealReference: string) {
  return fetchIgJson<IgDealConfirmationResponse>(
    environment,
    `/confirms/${encodeURIComponent(dealReference)}`,
    { version: "1" },
  );
}

function buildBrokerNote(reason: string | undefined, context: string) {
  if (!reason) {
    return context;
  }

  return `${context} (${reason})`;
}

export function isIgExecutionMode(
  executionMode: PersistedTradeTicket["executionMode"],
): executionMode is "IG Demo" | "IG Live" {
  return executionMode === "IG Demo" || executionMode === "IG Live";
}

export function resolveIgExecutionEnvironment(
  executionMode: Extract<PersistedTradeTicket["executionMode"], "IG Demo" | "IG Live">,
): IgEnvironment {
  return executionMode === "IG Live" ? "live" : "demo";
}

export async function submitIgTradeTicket(ticket: PersistedTradeTicket): Promise<BrokerExecutionUpdate> {
  if (!isIgExecutionMode(ticket.executionMode)) {
    throw new Error("submitIgTradeTicket only supports IG execution modes.");
  }

  const environment = resolveIgExecutionEnvironment(ticket.executionMode);
  const market = await getIgMarketMeta(ticket.symbol, environment);
  const direction = ticket.side === "Long" ? "BUY" : "SELL";
  const submittedAt = new Date().toISOString();

  if (market.marketStatus !== "TRADEABLE" && market.marketStatus !== "EDITS_ONLY") {
    throw new Error(`${ticket.symbol} is not tradeable at IG right now. Current status: ${market.marketStatus}.`);
  }

  const dealReference = buildDealReference("sig", ticket);
  const isWorkingOrder = ticket.orderType === "Limit" || ticket.orderType === "Stop Entry";

  const payload = isWorkingOrder
    ? {
        currencyCode: market.currencyCode,
        dealReference,
        direction,
        epic: market.epic,
        expiry: market.expiry,
        forceOpen: true,
        guaranteedStop: false,
        level: ticket.entry,
        limitDistance: null,
        limitLevel: ticket.takeProfit,
        size: ticket.quantity,
        stopDistance: null,
        stopLevel: ticket.stopLoss,
        timeInForce:
          ticket.timeInForce === "GTC" ? "GOOD_TILL_CANCELLED" : "GOOD_TILL_DATE",
        goodTillDate:
          ticket.timeInForce === "GTC" ? null : buildGoodTillDate(),
        type: mapWorkingOrderType(ticket.orderType),
      }
    : {
        currencyCode: market.currencyCode,
        dealReference,
        direction,
        epic: market.epic,
        expiry: market.expiry,
        forceOpen: true,
        guaranteedStop: false,
        level: ticket.orderType === "Limit" ? ticket.entry : undefined,
        limitDistance: null,
        limitLevel: ticket.takeProfit,
        orderType: mapPositionOrderType(ticket.orderType),
        quoteId: null,
        size: ticket.quantity,
        stopDistance: null,
        stopLevel: ticket.stopLoss,
        timeInForce: mapPositionTimeInForce(ticket.timeInForce),
      };

  await fetchIgJson<IgDealResponse>(
    environment,
    isWorkingOrder ? "/working-orders/otc" : "/positions/otc",
    {
      body: payload,
      method: "POST",
      version: isWorkingOrder ? "2" : "2",
    },
  );

  const confirmation = await fetchDealConfirmation(environment, dealReference);
  const confirmationTimestamp =
    parseIgTimestamp(confirmation.date) ?? submittedAt;
  const brokerDealId =
    confirmation.affectedDeals?.[0]?.dealId ?? confirmation.dealId ?? null;
  const isAccepted = confirmation.dealStatus === "ACCEPTED";

  if (!isAccepted) {
    return {
      brokerDealId,
      brokerReference: dealReference,
      brokerStatus: "Rejected",
      executedEntry: null,
      executedQuantity: null,
      filledAt: null,
      note: buildBrokerNote(confirmation.reason, `${ticket.executionMode} order was rejected by IG`),
      status: "Rejected",
      submittedAt: confirmationTimestamp,
    };
  }

  if (isWorkingOrder) {
    return {
      brokerDealId,
      brokerReference: dealReference,
      brokerStatus: "Working",
      executedEntry: null,
      executedQuantity: null,
      filledAt: null,
      note: `${ticket.executionMode} working order accepted by IG.`,
      status: "Working",
      submittedAt: confirmationTimestamp,
    };
  }

  return {
    brokerDealId,
    brokerReference: dealReference,
    brokerStatus: "Filled",
    executedEntry:
      typeof confirmation.level === "number" && Number.isFinite(confirmation.level)
        ? confirmation.level
        : ticket.entry,
    executedQuantity: ticket.quantity,
    filledAt: confirmationTimestamp,
    note: `${ticket.executionMode} position opened at IG.`,
    status: "Filled",
    submittedAt: confirmationTimestamp,
  };
}

export async function cancelIgTradeTicket(ticket: PersistedTradeTicket): Promise<BrokerCancellationUpdate> {
  if (!ticket.brokerDealId) {
    throw new Error("This ticket does not have an IG broker deal id yet, so it cannot be cancelled.");
  }

  if (!isIgExecutionMode(ticket.executionMode)) {
    throw new Error("cancelIgTradeTicket only supports IG execution modes.");
  }

  const environment = resolveIgExecutionEnvironment(ticket.executionMode);
  const dealReference = buildDealReference("cancel", ticket);

  await fetchIgJson<IgDealResponse>(
    environment,
    `/working-orders/otc/${encodeURIComponent(ticket.brokerDealId)}`,
    {
      body: { dealReference },
      method: "DELETE",
      version: "2",
    },
  );

  const confirmation = await fetchDealConfirmation(environment, dealReference);

  if (confirmation.dealStatus !== "ACCEPTED") {
    return {
      brokerReference: dealReference,
      brokerStatus: "Rejected",
      note: buildBrokerNote(confirmation.reason, `IG could not cancel the working order for ${ticket.symbol}`),
      status: "Rejected",
    };
  }

  return {
    brokerReference: dealReference,
    brokerStatus: "Cancelled",
    note: `${ticket.executionMode} working order cancelled at IG.`,
    status: "Cancelled",
  };
}

export async function closeIgTradeTicket(ticket: PersistedTradeTicket): Promise<BrokerCloseUpdate> {
  if (!ticket.brokerDealId) {
    throw new Error("This ticket does not have an IG broker deal id yet, so it cannot be closed.");
  }

  if (!isIgExecutionMode(ticket.executionMode)) {
    throw new Error("closeIgTradeTicket only supports IG execution modes.");
  }

  const environment = resolveIgExecutionEnvironment(ticket.executionMode);
  const dealReference = buildDealReference("close", ticket);
  const executedQuantity = ticket.executedQuantity ?? ticket.quantity;
  const reverseDirection = ticket.side === "Long" ? "SELL" : "BUY";

  await fetchIgJson<IgDealResponse>(
    environment,
    "/positions/otc",
    {
      body: {
        dealReference,
        dealId: ticket.brokerDealId,
        direction: reverseDirection,
        orderType: "MARKET",
        size: executedQuantity,
        timeInForce: "EXECUTE_AND_ELIMINATE",
      },
      method: "DELETE",
      version: "1",
    },
  );

  const confirmation = await fetchDealConfirmation(environment, dealReference);
  const closedAt =
    parseIgTimestamp(confirmation.date) ?? new Date().toISOString();

  if (confirmation.dealStatus !== "ACCEPTED") {
    return {
      brokerReference: dealReference,
      brokerStatus: "Rejected",
      closedAt,
      executedEntry: null,
      note: buildBrokerNote(confirmation.reason, `IG could not close the position for ${ticket.symbol}`),
      realizedPnl: null,
      status: "Rejected",
    };
  }

  return {
    brokerReference: dealReference,
    brokerStatus: "Closed",
    closedAt,
    executedEntry:
      typeof confirmation.level === "number" && Number.isFinite(confirmation.level)
        ? confirmation.level
        : null,
    note: `${ticket.executionMode} position closed at IG.`,
    realizedPnl:
      typeof confirmation.profit === "number" && Number.isFinite(confirmation.profit)
        ? Number(confirmation.profit.toFixed(2))
        : null,
    status: "Closed",
  };
}

function resolveSymbolForEpic(epic: string) {
  const normalizedEpic = normalizeComparableValue(epic.toUpperCase());
  const definitions = listMarketDataAssetDefinitions();
  const exactMatch = definitions.find((definition) => definition.igEpic?.toUpperCase() === epic.toUpperCase());

  if (exactMatch) {
    return exactMatch.symbol;
  }

  const searchTermMatch = definitions.find((definition) => {
    if (normalizedEpic.includes(normalizeComparableValue(definition.symbol.toUpperCase()))) {
      return true;
    }

    return definition.searchTerms.some((searchTerm) =>
      normalizedEpic.includes(normalizeComparableValue(searchTerm.toUpperCase())),
    );
  });

  return searchTermMatch?.symbol ?? epic.toUpperCase();
}

export async function testIgBrokerConnection(environment: IgEnvironment) {
  const session = await getIgSession(environment);
  return {
    accountId: session.accountId,
    environment,
  };
}

export async function fetchIgBrokerSnapshot(environment: IgEnvironment): Promise<IgBrokerSyncSnapshot> {
  const session = await getIgSession(environment);
  const positionsResponse: IgOpenPositionsResponse = await fetchIgJson<IgOpenPositionsResponse>(
    environment,
    "/positions",
    { version: "2" },
  )
    .catch(() => fetchIgJson<IgOpenPositionsResponse>(environment, "/positions", { version: "1" }))
    .catch(() => ({ positions: [] }));
  const workingOrdersResponse: IgWorkingOrdersResponse =
    await fetchIgJson<IgWorkingOrdersResponse>(environment, "/working-orders", { version: "2" })
      .catch(() =>
        fetchIgJson<IgWorkingOrdersResponse>(environment, "/working-orders", { version: "1" }),
      )
      .catch(() => ({ workingOrders: [] }));
  const fetchedAt = new Date().toISOString();

  const positions = (positionsResponse.positions ?? [])
    .map((entry: NonNullable<IgOpenPositionsResponse["positions"]>[number]) => {
      const position = entry.position;
      const epic = entry.market?.epic;

      if (
        !position?.dealId ||
        !epic ||
        typeof position.level !== "number" ||
        typeof position.size !== "number" ||
        !position.direction
      ) {
        return null;
      }

      return {
        createdAt:
          parseIgTimestamp(position.createdDateUTC) ??
          parseIgTimestamp(position.createdDate) ??
          null,
        currency: position.currency ?? null,
        dealId: position.dealId,
        dealReference: position.dealReference ?? null,
        direction: position.direction,
        epic,
        level: position.level,
        limitLevel:
          typeof position.limitLevel === "number" && Number.isFinite(position.limitLevel)
            ? position.limitLevel
            : null,
        name: entry.market?.instrumentName ?? null,
        size: position.size,
        stopLevel:
          typeof position.stopLevel === "number" && Number.isFinite(position.stopLevel)
            ? position.stopLevel
            : null,
        symbol: resolveSymbolForEpic(epic),
      } satisfies IgSyncedOpenPosition;
    })
    .filter((value: IgSyncedOpenPosition | null): value is IgSyncedOpenPosition => Boolean(value));

  const workingOrders = (workingOrdersResponse.workingOrders ?? [])
    .map((entry: NonNullable<IgWorkingOrdersResponse["workingOrders"]>[number]) => {
      const order = entry.workingOrderData;
      const epic = order?.epic ?? entry.marketData?.epic;

      if (
        !order?.dealId ||
        !epic ||
        typeof order.level !== "number" ||
        typeof order.size !== "number" ||
        !order.direction ||
        !order.orderType
      ) {
        return null;
      }

      return {
        createdAt:
          parseIgTimestamp(order.createdDateUTC) ??
          parseIgTimestamp(order.createdDate) ??
          parseIgTimestamp(order.goodTillDate) ??
          null,
        currency: order.currencyCode ?? null,
        dealId: order.dealId,
        dealReference: order.dealReference ?? null,
        direction: order.direction,
        epic,
        level: order.level,
        limitLevel:
          typeof order.limitLevel === "number" && Number.isFinite(order.limitLevel)
            ? order.limitLevel
            : null,
        name: entry.marketData?.instrumentName ?? null,
        orderType: order.orderType,
        size: order.size,
        stopLevel:
          typeof order.stopLevel === "number" && Number.isFinite(order.stopLevel)
            ? order.stopLevel
            : null,
        symbol: resolveSymbolForEpic(epic),
        timeInForce: order.timeInForce ?? null,
      } satisfies IgSyncedWorkingOrder;
    })
    .filter((value: IgSyncedWorkingOrder | null): value is IgSyncedWorkingOrder => Boolean(value));

  return {
    accountId: session.accountId,
    fetchedAt,
    positions,
    workingOrders,
  };
}
