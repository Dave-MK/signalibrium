"use client";

import { useState, useCallback } from "react";
import { updateRiskControlsApi } from "@/app/_lib/workspace-api";
import type { PersistedRiskControls } from "@/app/_lib/server/workspace-types";

type Props = {
  initial: PersistedRiskControls;
};

// ── Field helpers ───────────────────────────────────────────────────────────────

function pctToFraction(pct: string | number): number {
  return Number(pct) / 100;
}

function fractionToPct(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
  warning,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  warning?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="sm:w-56 shrink-0">
        <p className="text-[0.8rem] font-medium text-slate-200">{label}</p>
        <p className="text-[0.7rem] leading-snug text-slate-500">{hint}</p>
      </div>
      <div className="flex-1">
        {children}
        {warning && (
          <p className="mt-1 text-[0.65rem] text-amber-400">{warning}</p>
        )}
      </div>
    </div>
  );
}

function PctInput({
  value,
  onChange,
  min = 0.1,
  max = 100,
  step = 0.1,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-[0.32rem] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[0.8rem] text-white tabular-nums outline-none focus:border-[#00C884]/50 focus:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className="text-[0.76rem] text-slate-500">%</span>
    </div>
  );
}

function IntInput({
  value,
  onChange,
  min = 1,
  max = 100,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded-[0.32rem] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[0.8rem] text-white tabular-nums outline-none focus:border-[#00C884]/50 focus:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function GbpInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[0.76rem] text-slate-500">£</span>
      <input
        type="number"
        min={10}
        step={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-[0.32rem] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[0.8rem] text-white tabular-nums outline-none focus:border-[#00C884]/50 focus:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export function RiskControlsPanel({ initial }: Props) {
  // ── Local form state (display as percentages) ─────────────────────────────
  const [maxRiskPct, setMaxRiskPct]           = useState(fractionToPct(initial.maxRiskPerTrade));
  const [cashReservePct, setCashReservePct]   = useState(fractionToPct(initial.minCashReserveRatio));
  const [maxTrades, setMaxTrades]             = useState(String(initial.maxConcurrentTrades));
  const [dailyLimitEnabled, setDailyLimitEnabled] = useState(initial.dailyLossLimitRatio != null);
  const [dailyLimitPct, setDailyLimitPct]     = useState(
    initial.dailyLossLimitRatio != null ? fractionToPct(initial.dailyLossLimitRatio) : "5.0",
  );
  const [posCapEnabled, setPosCapEnabled]     = useState(initial.maxPositionSizeGbp != null);
  const [posCapGbp, setPosCapGbp]             = useState(
    initial.maxPositionSizeGbp != null ? String(initial.maxPositionSizeGbp) : "1000",
  );

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await updateRiskControlsApi({
        maxRiskPerTrade:      pctToFraction(maxRiskPct),
        minCashReserveRatio:  pctToFraction(cashReservePct),
        maxConcurrentTrades:  Math.round(Number(maxTrades)),
        dailyLossLimitRatio:  dailyLimitEnabled ? pctToFraction(dailyLimitPct) : null,
        maxPositionSizeGbp:   posCapEnabled ? Number(posCapGbp) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save risk controls.");
    } finally {
      setSaving(false);
    }
  }, [
    maxRiskPct,
    cashReservePct,
    maxTrades,
    dailyLimitEnabled,
    dailyLimitPct,
    posCapEnabled,
    posCapGbp,
  ]);

  return (
    <div className="signal-surface-soft rounded-[0.65rem] divide-y divide-white/6">
      {/* Header */}
      <div className="px-4 py-3.5 sm:px-5">
        <p className="text-[0.84rem] font-semibold text-slate-100">Risk guard-rails</p>
        <p className="text-[0.72rem] leading-snug text-slate-500">
          These settings apply to Siggi&apos;s paper simulation. Changes take effect on the next sync.
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-5 px-4 py-4 sm:px-5">
        {/* Max risk per trade */}
        <FieldRow
          label="Max risk per trade"
          hint="Percentage of total equity risked on each individual position."
          warning={
            Number(maxRiskPct) > 3
              ? "High risk — each trade could lose more than 3% of the account."
              : undefined
          }
        >
          <PctInput value={maxRiskPct} onChange={setMaxRiskPct} min={0.1} max={10} step={0.1} />
        </FieldRow>

        {/* Cash reserve */}
        <FieldRow
          label="Cash reserve"
          hint="Minimum percentage of equity kept as liquid buffer. Siggi won't deploy this cash."
        >
          <PctInput value={cashReservePct} onChange={setCashReservePct} min={0} max={50} step={0.5} />
        </FieldRow>

        {/* Max concurrent trades */}
        <FieldRow
          label="Max concurrent trades"
          hint="Hard cap on how many positions Siggi can hold open at the same time."
        >
          <IntInput value={maxTrades} onChange={setMaxTrades} min={1} max={100} />
        </FieldRow>

        {/* Daily loss limit */}
        <FieldRow
          label="Daily loss limit"
          hint="If equity drops by this % from the day-start level, Siggi stops opening new trades for the rest of the session."
        >
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={dailyLimitEnabled}
                onClick={() => setDailyLimitEnabled((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
                  dailyLimitEnabled ? "bg-[#00C884]" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    dailyLimitEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[0.76rem] text-slate-400">
                {dailyLimitEnabled ? "Enabled" : "Disabled (no daily limit)"}
              </span>
            </label>
            {dailyLimitEnabled && (
              <PctInput value={dailyLimitPct} onChange={setDailyLimitPct} min={0.5} max={50} step={0.5} />
            )}
          </div>
        </FieldRow>

        {/* Max position size */}
        <FieldRow
          label="Max position size"
          hint="Absolute GBP cap per trade. Overrides the risk-based sizing if lower."
        >
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={posCapEnabled}
                onClick={() => setPosCapEnabled((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
                  posCapEnabled ? "bg-[#00C884]" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    posCapEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[0.76rem] text-slate-400">
                {posCapEnabled ? "Enabled" : "Disabled (no cap)"}
              </span>
            </label>
            {posCapEnabled && (
              <GbpInput value={posCapGbp} onChange={setPosCapGbp} />
            )}
          </div>
        </FieldRow>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        {error ? (
          <p className="text-[0.72rem] text-red-400">{error}</p>
        ) : saved ? (
          <p className="text-[0.72rem] text-emerald-400">Saved — takes effect on next sync.</p>
        ) : (
          <p className="text-[0.7rem] text-slate-600">Changes apply to the simulation only, not to live broker orders.</p>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="shrink-0 rounded-[0.36rem] bg-[#00C884]/80 px-4 py-1.5 text-[0.78rem] font-medium text-white transition hover:bg-[#00C884]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
