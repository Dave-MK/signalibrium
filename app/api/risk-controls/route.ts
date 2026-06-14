/**
 * GET  /api/risk-controls  → { controls: PersistedRiskControls }
 * PATCH /api/risk-controls  → { controls: PersistedRiskControls }
 *
 * Returns or updates Siggi's guard-rail settings.
 */

import { NextResponse } from "next/server";
import {
  getRiskControls,
  updateRiskControls,
} from "@/app/_lib/server/repositories/risk-controls";
import type { UpdateRiskControlsInput } from "@/app/_lib/server/repositories/risk-controls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controls = await getRiskControls();
    return NextResponse.json({ controls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as UpdateRiskControlsInput;

    // Validate individual fields — reject obviously bad values
    const patch: UpdateRiskControlsInput = {};

    if (body.maxRiskPerTrade !== undefined) {
      const v = Number(body.maxRiskPerTrade);
      if (!Number.isFinite(v) || v <= 0 || v >= 1) {
        return NextResponse.json(
          { error: "maxRiskPerTrade must be a fraction between 0 and 1 (e.g. 0.02 for 2%)" },
          { status: 400 },
        );
      }
      patch.maxRiskPerTrade = v;
    }

    if (body.minCashReserveRatio !== undefined) {
      const v = Number(body.minCashReserveRatio);
      if (!Number.isFinite(v) || v < 0 || v >= 1) {
        return NextResponse.json(
          { error: "minCashReserveRatio must be a fraction between 0 and 1 (e.g. 0.05 for 5%)" },
          { status: 400 },
        );
      }
      patch.minCashReserveRatio = v;
    }

    if (body.maxConcurrentTrades !== undefined) {
      const v = Number(body.maxConcurrentTrades);
      if (!Number.isInteger(v) || v < 1 || v > 100) {
        return NextResponse.json(
          { error: "maxConcurrentTrades must be an integer between 1 and 100" },
          { status: 400 },
        );
      }
      patch.maxConcurrentTrades = v;
    }

    if (body.dailyLossLimitRatio !== undefined) {
      if (body.dailyLossLimitRatio === null) {
        patch.dailyLossLimitRatio = null;
      } else {
        const v = Number(body.dailyLossLimitRatio);
        if (!Number.isFinite(v) || v <= 0 || v >= 1) {
          return NextResponse.json(
            { error: "dailyLossLimitRatio must be null or a fraction between 0 and 1" },
            { status: 400 },
          );
        }
        patch.dailyLossLimitRatio = v;
      }
    }

    if (body.maxPositionSizeGbp !== undefined) {
      if (body.maxPositionSizeGbp === null) {
        patch.maxPositionSizeGbp = null;
      } else {
        const v = Number(body.maxPositionSizeGbp);
        if (!Number.isFinite(v) || v <= 0) {
          return NextResponse.json(
            { error: "maxPositionSizeGbp must be null or a positive number" },
            { status: 400 },
          );
        }
        patch.maxPositionSizeGbp = v;
      }
    }

    const controls = await updateRiskControls(patch);
    return NextResponse.json({ controls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
