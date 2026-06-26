import { describe, expect, it } from "vitest";
import {
  clamp,
  computeConsecutiveLosses,
  computeRiskReward,
  computeTotalEquityGbp,
  computeTotalOpenRiskGbp,
  computeUnrealizedPnlUsd,
  convertGbpToUsd,
  getCorrelationGroup,
  isSignalFresh,
  pnlToTradeStatus,
  roundMoney,
  shouldCloseFromLivePrice,
} from "./siggi-simulation";
import type {
  PersistedPredictionHistoryRecord,
  PersistedSiggiAccount,
  PersistedSiggiTrade,
} from "./workspace-types";

// ── Minimal fixture factories ──────────────────────────────────────────────
// These functions read only a handful of fields each, so the fixtures carry
// just those fields and are cast to the full persisted type.

function trade(overrides: Partial<PersistedSiggiTrade>): PersistedSiggiTrade {
  return {
    side: "BUY",
    entryPrice: 100,
    stopPrice: 90,
    targetPrice: 130,
    quantity: 1,
    stakeGbp: 0,
    unrealizedPnlGbp: 0,
    status: "Open",
    ...overrides,
  } as unknown as PersistedSiggiTrade;
}

function account(overrides: Partial<PersistedSiggiAccount>): PersistedSiggiAccount {
  return {
    cashBalanceGbp: 0,
    openTrades: [],
    closedTrades: [],
    ...overrides,
  } as unknown as PersistedSiggiAccount;
}

function record(
  overrides: Partial<PersistedPredictionHistoryRecord>,
): PersistedPredictionHistoryRecord {
  return {
    actionAtCall: "BUY",
    entryLowAtCall: 100,
    entryHighAtCall: 102,
    stopPriceAtCall: 90,
    targetPriceAtCall: 130,
    horizon: "Day",
    calledAt: "2026-06-26T00:00:00.000Z",
    ...overrides,
  } as unknown as PersistedPredictionHistoryRecord;
}

// ── Pure number helpers ─────────────────────────────────────────────────────

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(1.005)).toBeCloseTo(1.0, 5); // toFixed banker-ish rounding
    expect(roundMoney(1.239)).toBe(1.24);
    expect(roundMoney(10)).toBe(10);
  });
});

describe("clamp", () => {
  it("bounds a value within [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("convertGbpToUsd", () => {
  it("divides by the USD->GBP rate", () => {
    // £80 at 0.8 GBP per USD => $100
    expect(convertGbpToUsd(80, 0.8)).toBeCloseTo(100, 6);
  });

  it("falls back to the GBP value when the rate is invalid", () => {
    expect(convertGbpToUsd(80, 0)).toBe(80);
    expect(convertGbpToUsd(80, -1)).toBe(80);
    expect(convertGbpToUsd(80, Number.NaN)).toBe(80);
  });
});

// ── P&L direction ───────────────────────────────────────────────────────────

describe("computeUnrealizedPnlUsd", () => {
  it("profits on a long when price rises", () => {
    expect(computeUnrealizedPnlUsd(trade({ side: "BUY", entryPrice: 100, quantity: 2 }), 110)).toBe(20);
  });

  it("loses on a long when price falls", () => {
    expect(computeUnrealizedPnlUsd(trade({ side: "BUY", entryPrice: 100, quantity: 2 }), 90)).toBe(-20);
  });

  it("profits on a short when price falls", () => {
    expect(computeUnrealizedPnlUsd(trade({ side: "SELL", entryPrice: 100, quantity: 2 }), 90)).toBe(20);
  });

  it("loses on a short when price rises", () => {
    expect(computeUnrealizedPnlUsd(trade({ side: "SELL", entryPrice: 100, quantity: 2 }), 110)).toBe(-20);
  });
});

// ── Trade-status classification ─────────────────────────────────────────────

describe("pnlToTradeStatus", () => {
  it("classifies clear wins and losses", () => {
    expect(pnlToTradeStatus(5)).toBe("Hit Target");
    expect(pnlToTradeStatus(-5)).toBe("Stopped");
  });

  it("treats sub-penny P&L as breakeven (rounding tolerance)", () => {
    expect(pnlToTradeStatus(0)).toBe("Breakeven");
    expect(pnlToTradeStatus(0.01)).toBe("Breakeven");
    expect(pnlToTradeStatus(-0.01)).toBe("Breakeven");
  });

  it("flips to win/loss just outside the tolerance", () => {
    expect(pnlToTradeStatus(0.02)).toBe("Hit Target");
    expect(pnlToTradeStatus(-0.02)).toBe("Stopped");
  });
});

// ── Anti-tilt streak counter ────────────────────────────────────────────────

describe("computeConsecutiveLosses", () => {
  it("counts the current losing streak from newest-first closed trades", () => {
    const acc = account({
      closedTrades: [
        trade({ status: "Stopped" }),
        trade({ status: "Stopped" }),
        trade({ status: "Hit Target" }),
        trade({ status: "Stopped" }),
      ],
    });
    expect(computeConsecutiveLosses(acc)).toBe(2);
  });

  it("stops counting at the first win or breakeven", () => {
    expect(computeConsecutiveLosses(account({ closedTrades: [trade({ status: "Hit Target" })] }))).toBe(0);
    expect(
      computeConsecutiveLosses(account({ closedTrades: [trade({ status: "Stopped" }), trade({ status: "Breakeven" }), trade({ status: "Stopped" })] })),
    ).toBe(1);
  });

  it("returns 0 with no closed trades", () => {
    expect(computeConsecutiveLosses(account({ closedTrades: [] }))).toBe(0);
  });
});

// ── Equity & open-risk aggregation ──────────────────────────────────────────

describe("computeTotalEquityGbp", () => {
  it("sums cash plus each open trade's stake and unrealised P&L", () => {
    const acc = account({
      cashBalanceGbp: 1000,
      openTrades: [
        trade({ stakeGbp: 200, unrealizedPnlGbp: 50 }),
        trade({ stakeGbp: 100, unrealizedPnlGbp: -10 }),
      ],
    });
    expect(computeTotalEquityGbp(acc)).toBe(1340);
  });

  it("treats a null unrealised P&L as zero", () => {
    const acc = account({
      cashBalanceGbp: 500,
      openTrades: [trade({ stakeGbp: 100, unrealizedPnlGbp: null })],
    });
    expect(computeTotalEquityGbp(acc)).toBe(600);
  });
});

describe("computeTotalOpenRiskGbp", () => {
  it("sums per-trade stop distance * quantity, converted to GBP", () => {
    const acc = account({
      openTrades: [
        trade({ entryPrice: 100, stopPrice: 90, quantity: 2 }), // risk 10 * 2 = 20 USD
        trade({ entryPrice: 50, stopPrice: 48, quantity: 5 }), //  risk 2 * 5  = 10 USD
      ],
    });
    // 30 USD * 0.8 GBP/USD = 24 GBP
    expect(computeTotalOpenRiskGbp(acc, 0.8)).toBeCloseTo(24, 6);
  });
});

// ── Risk:reward, by side ────────────────────────────────────────────────────

describe("computeRiskReward", () => {
  it("uses the entry low for a BUY", () => {
    // entry 100, stop 90 (risk 10), target 130 (reward 30) => 3R
    expect(computeRiskReward(record({ actionAtCall: "BUY" }))).toBeCloseTo(3, 6);
  });

  it("uses the entry high for a SELL", () => {
    // entry 102, stop 112 (risk 10), target 82 (reward 20) => 2R
    const r = record({
      actionAtCall: "SELL",
      entryHighAtCall: 102,
      stopPriceAtCall: 112,
      targetPriceAtCall: 82,
    });
    expect(computeRiskReward(r)).toBeCloseTo(2, 6);
  });

  it("returns 0 when the risk distance is zero (avoids divide-by-zero)", () => {
    expect(computeRiskReward(record({ entryLowAtCall: 100, stopPriceAtCall: 100 }))).toBe(0);
  });
});

// ── Signal freshness ────────────────────────────────────────────────────────

describe("isSignalFresh", () => {
  const calledAt = "2026-06-26T00:00:00.000Z";
  const calledMs = Date.parse(calledAt);

  it("accepts a Day signal within its 8h window", () => {
    expect(isSignalFresh(record({ horizon: "Day", calledAt }), calledMs + 7 * 3600_000)).toBe(true);
  });

  it("rejects a Day signal past its 8h window", () => {
    expect(isSignalFresh(record({ horizon: "Day", calledAt }), calledMs + 9 * 3600_000)).toBe(false);
  });

  it("gives a Week signal a longer 48h window", () => {
    expect(isSignalFresh(record({ horizon: "Week", calledAt }), calledMs + 40 * 3600_000)).toBe(true);
  });
});

// ── Live-price close logic (pessimistic: stop wins ties) ─────────────────────

describe("shouldCloseFromLivePrice", () => {
  it("returns null while a long sits between stop and target", () => {
    expect(shouldCloseFromLivePrice(trade({ side: "BUY", stopPrice: 90, targetPrice: 130 }), 100)).toBeNull();
  });

  it("closes a long at target and at stop", () => {
    expect(shouldCloseFromLivePrice(trade({ side: "BUY", stopPrice: 90, targetPrice: 130 }), 131)).toBe("Hit Target");
    expect(shouldCloseFromLivePrice(trade({ side: "BUY", stopPrice: 90, targetPrice: 130 }), 89)).toBe("Stopped");
  });

  it("closes a short at target and at stop", () => {
    expect(shouldCloseFromLivePrice(trade({ side: "SELL", stopPrice: 112, targetPrice: 82 }), 81)).toBe("Hit Target");
    expect(shouldCloseFromLivePrice(trade({ side: "SELL", stopPrice: 112, targetPrice: 82 }), 113)).toBe("Stopped");
  });

  it("lets the stop win when both levels are breached at once (long)", () => {
    // A degenerate trade where stop >= target: a single price hits both.
    expect(shouldCloseFromLivePrice(trade({ side: "BUY", stopPrice: 130, targetPrice: 120 }), 125)).toBe("Stopped");
  });

  it("lets the stop win when both levels are breached at once (short)", () => {
    expect(shouldCloseFromLivePrice(trade({ side: "SELL", stopPrice: 80, targetPrice: 90 }), 85)).toBe("Stopped");
  });
});

// ── Correlation grouping ────────────────────────────────────────────────────

describe("getCorrelationGroup", () => {
  it("maps BTC aliases (spacing/casing normalised) to one group", () => {
    expect(getCorrelationGroup("BTC/USD")).toBe("crypto-btc");
    expect(getCorrelationGroup("btcusd")).toBe("crypto-btc");
    expect(getCorrelationGroup("XBT USD")).toBe("crypto-btc");
  });

  it("groups big-tech equities together", () => {
    expect(getCorrelationGroup("AAPL")).toBe("us-big-tech");
    expect(getCorrelationGroup("nvda")).toBe("us-big-tech");
  });

  it("returns null for an uncorrelated / unknown symbol", () => {
    expect(getCorrelationGroup("DOGE/USD")).toBeNull();
  });
});
