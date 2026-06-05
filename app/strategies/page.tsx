import type { Metadata } from "next";
import Link from "next/link";
import {
  candlePatternGuide,
  strategyDecisionFramework,
  strategyProfiles,
  trendPatternGuide,
} from "@/app/_lib/strategy-profiles";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";

export const metadata: Metadata = {
  title: "Strategies | Signalibrium",
  description: "Entry strategies currently employed by Siggi across monitored markets.",
};

function formatHoldWindow(minimum: number, maximum: number) {
  if (maximum < 24) {
    return `${minimum}-${maximum}h`;
  }

  return `${Math.round(minimum / 24)}-${Math.round(maximum / 24)}d`;
}

function CandleSketch({ label }: { label: string }) {
  if (label.includes("Engulfing")) {
    return (
      <svg viewBox="0 0 64 44" className="h-11 w-16 text-cyan-200" fill="none">
        <path d="M17 8v28" stroke="currentColor" strokeWidth="2" />
        <rect x="11" y="17" width="12" height="12" rx="1.5" fill="rgba(239,68,68,0.28)" stroke="rgba(248,113,113,0.7)" />
        <path d="M42 5v34" stroke="currentColor" strokeWidth="2" />
        <rect x="34" y="10" width="16" height="24" rx="1.5" fill="rgba(34,197,94,0.24)" stroke="rgba(110,231,183,0.78)" />
      </svg>
    );
  }

  if (label.includes("Rejection")) {
    return (
      <svg viewBox="0 0 64 44" className="h-11 w-16 text-cyan-200" fill="none">
        <path d="M6 31h52" stroke="rgba(217,183,95,0.88)" strokeWidth="2" strokeLinecap="round" />
        <path d="M49 25 57 31 49 37" stroke="rgba(217,183,95,0.82)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 7v33" stroke="currentColor" strokeWidth="2" />
        <rect x="22" y="12" width="20" height="14" rx="1.5" fill="rgba(0,229,255,0.16)" stroke="rgba(125,211,252,0.78)" />
        <path d="M28 38h8" stroke="rgba(248,113,113,0.8)" strokeWidth="2" strokeLinecap="round" />
        <text x="7" y="27" fill="rgba(217,183,95,0.95)" fontSize="6" fontWeight="700">
          level
        </text>
      </svg>
    );
  }

  if (label.includes("Doji")) {
    return (
      <svg viewBox="0 0 64 44" className="h-11 w-16 text-cyan-200" fill="none">
        <path d="M32 4v36" stroke="currentColor" strokeWidth="2" />
        <path d="M20 22h24" stroke="rgba(217,183,95,0.95)" strokeWidth="3" strokeLinecap="round" />
        <path d="M14 14h36M14 30h36" stroke="rgba(148,163,184,0.22)" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    );
  }

  if (label.includes("Displacement")) {
    return (
      <svg viewBox="0 0 64 44" className="h-11 w-16 text-cyan-200" fill="none">
        <path d="M32 5v35" stroke="currentColor" strokeWidth="2" />
        <rect x="22" y="7" width="20" height="30" rx="1.5" fill="rgba(34,197,94,0.26)" stroke="rgba(110,231,183,0.85)" />
        <path d="M48 30 58 20 48 10" stroke="rgba(0,229,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 44" className="h-11 w-16 text-cyan-200" fill="none">
      <path d="M18 12v24" stroke="rgba(110,231,183,0.75)" strokeWidth="2" />
      <rect x="12" y="15" width="12" height="16" rx="1.5" fill="rgba(34,197,94,0.2)" stroke="rgba(110,231,183,0.75)" />
      <path d="M39 4v36" stroke="currentColor" strokeWidth="2" />
      <rect x="29" y="5" width="20" height="29" rx="1.5" fill="rgba(239,68,68,0.24)" stroke="rgba(248,113,113,0.78)" />
      <path d="M50 8 57 4M50 31 57 36" stroke="rgba(217,183,95,0.8)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default async function StrategiesPage() {
  const [assets, scannerResults] = await Promise.all([listAssets(), listScannerResults()]);
  const scannerResultsByStrategy = new Map(
    strategyProfiles.map((profile) => [
      profile.name,
      scannerResults
        .filter((result) => result.strategy === profile.name)
        .sort((left, right) => right.score - left.score),
    ]),
  );
  const assetsByStrategy = new Map(
    strategyProfiles.map((profile) => [
      profile.name,
      assets
        .filter((asset) => asset.activeStrategy === profile.name)
        .sort((left, right) => right.score - left.score),
    ]),
  );
  const employedCount = strategyProfiles.filter((profile) => {
    const setupCount = scannerResultsByStrategy.get(profile.name)?.length ?? 0;
    const assetCount = assetsByStrategy.get(profile.name)?.length ?? 0;

    return setupCount + assetCount > 0;
  }).length;

  return (
    <div className="space-y-1.25">
      <section className="panel p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="micro-label">Strategies</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Siggi&apos;s entry playbooks
            </h1>
            <p className="mt-1 max-w-3xl text-[0.88rem] leading-6 text-slate-400">
              The live strategy set Siggi rotates through when ranking opportunities and defining entry timing.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.25 sm:min-w-96">
            <div className="signal-surface-soft p-2.5">
              <p className="micro-label">Employed</p>
              <p className="mt-1 text-xl font-semibold text-white">{employedCount}</p>
            </div>
            <div className="signal-surface-soft p-2.5">
              <p className="micro-label">Profiles</p>
              <p className="mt-1 text-xl font-semibold text-white">{strategyProfiles.length}</p>
            </div>
            <div className="signal-surface-soft p-2.5">
              <p className="micro-label">Setups</p>
              <p className="mt-1 text-xl font-semibold text-white">{scannerResults.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-1.25 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
        <div className="panel p-3.5">
          <p className="micro-label">Decision Stack</p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            How Siggy validates a prediction
          </h2>
          <div className="mt-3 grid gap-1.25 md:grid-cols-5">
            {strategyDecisionFramework.map((layer, index) => (
              <div key={layer.label} className="signal-surface-soft p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-[0.72rem] font-bold text-cyan-200">
                    {index + 1}
                  </span>
                  <p className="text-[0.78rem] font-semibold text-white">{layer.label}</p>
                </div>
                <p className="mt-2 text-[0.76rem] leading-5 text-slate-400">{layer.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-3.5">
          <p className="micro-label">Confluence Rule</p>
          <div className="mt-2 rounded-[0.5rem] border border-cyan-300/16 bg-[radial-gradient(circle_at_20%_0%,rgba(0,229,255,0.12),transparent_38%),linear-gradient(180deg,rgba(8,29,40,0.7),rgba(10,17,27,0.72))] p-3">
            <p className="text-[0.95rem] font-semibold text-white">
              No single pattern gets to boss the trade.
            </p>
            <p className="mt-2 text-[0.8rem] leading-6 text-slate-300">
              Siggy upgrades confidence when structure, location, candle behaviour,
              indicators, market time, and event risk point the same way. If they
              conflict, the setup waits or gets downgraded.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-1.25 xl:grid-cols-2">
        <div className="panel p-3.5">
          <p className="micro-label">Candles</p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            What candle types tell Siggy
          </h2>
          <div className="mt-3 grid gap-1.25 sm:grid-cols-2">
            {candlePatternGuide.map((pattern) => (
              <div key={pattern.label} className="signal-surface-soft p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-13 w-18 shrink-0 items-center justify-center rounded-[0.45rem] border border-white/8 bg-[#07111d]">
                    <CandleSketch label={pattern.label} />
                  </div>
                  <p className="text-[0.86rem] font-semibold text-white">{pattern.label}</p>
                </div>
                <p className="mt-2 text-[0.78rem] leading-5 text-slate-400">{pattern.meaning}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-3.5">
          <p className="micro-label">Patterns</p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Trend structures Siggy cross-references
          </h2>
          <div className="mt-3 grid gap-1.25 sm:grid-cols-2">
            {trendPatternGuide.map((pattern) => (
              <div key={pattern.label} className="signal-surface-soft p-2.5">
                <div className="mb-2 h-10 rounded-[0.4rem] border border-white/8 bg-[#07111d] px-2 py-1.5">
                  <svg viewBox="0 0 120 28" className="h-full w-full text-cyan-200" fill="none" stroke="currentColor" strokeWidth="2">
                    {pattern.label.startsWith("M") ? (
                      <path d="M4 22 24 6 46 20 68 7 92 23 116 18" />
                    ) : pattern.label.startsWith("W") ? (
                      <path d="M4 7 26 22 48 8 70 21 94 6 116 11" />
                    ) : pattern.label.includes("Compression") ? (
                      <path d="M4 8 28 20 54 10 78 17 116 13" />
                    ) : pattern.label.includes("Break") ? (
                      <path d="M4 20 H42 M42 20 60 8 78 18 116 7" />
                    ) : (
                      <path d="M4 20 30 7 56 14 80 9 116 4" />
                    )}
                  </svg>
                </div>
                <p className="text-[0.86rem] font-semibold text-white">{pattern.label}</p>
                <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">{pattern.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-1.25 xl:grid-cols-2">
        {strategyProfiles.map((profile) => {
          const matchedSetups = scannerResultsByStrategy.get(profile.name) ?? [];
          const matchedAssets = assetsByStrategy.get(profile.name) ?? [];
          const isEmployed = matchedSetups.length + matchedAssets.length > 0;
          const topSetups = matchedSetups.slice(0, 4);

          return (
            <article key={profile.id} className="panel p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[1.05rem] font-semibold text-white">{profile.name}</h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] ${
                        isEmployed
                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                          : "border-slate-500/20 bg-slate-500/8 text-slate-400"
                      }`}
                    >
                      {isEmployed ? "In use" : "Dormant"}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.84rem] leading-6 text-slate-300">{profile.thesis}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-1.25 sm:w-44">
                  <div className="signal-surface-soft p-2">
                    <p className="micro-label">Hold</p>
                    <p className="mt-1 text-[0.86rem] font-semibold text-white">
                      {formatHoldWindow(
                        profile.typicalHoldHours.minimum,
                        profile.typicalHoldHours.maximum,
                      )}
                    </p>
                  </div>
                  <div className="signal-surface-soft p-2">
                    <p className="micro-label">Live</p>
                    <p className="mt-1 text-[0.86rem] font-semibold text-white">
                      {matchedSetups.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-1.25 md:grid-cols-3">
                <div className="signal-surface-soft p-2.5">
                  <p className="micro-label">Markets</p>
                  <p className="mt-1 text-[0.8rem] leading-5 text-slate-300">
                    {profile.supportedAssets.join(", ")}
                  </p>
                </div>
                <div className="signal-surface-soft p-2.5">
                  <p className="micro-label">Timeframes</p>
                  <p className="mt-1 text-[0.8rem] leading-5 text-slate-300">
                    {profile.supportedTimeframes.join(", ")}
                  </p>
                </div>
                <div className="signal-surface-soft p-2.5">
                  <p className="micro-label">Best Regime</p>
                  <p className="mt-1 text-[0.8rem] leading-5 text-slate-300">
                    {profile.bestRegimes.join(", ")}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.75fr)]">
                <div>
                  <p className="micro-label">Entry Rules</p>
                  <div className="mt-2 space-y-1.25">
                    {profile.visualModel ? (
                      <div className="signal-accent-surface p-2.5">
                        <p className="text-[0.8rem] font-semibold text-cyan-100">
                          {profile.visualModel.pattern}
                        </p>
                        <div className="mt-2 grid gap-1.25 sm:grid-cols-2">
                          <p className="text-[0.74rem] leading-5 text-slate-400">
                            <span className="text-slate-200">Entry:</span>{" "}
                            {profile.visualModel.entry}
                          </p>
                          <p className="text-[0.74rem] leading-5 text-slate-400">
                            <span className="text-slate-200">Invalidation:</span>{" "}
                            {profile.visualModel.invalidation}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {profile.rules.map((rule) => (
                      <div key={rule} className="signal-surface-soft flex gap-2 p-2.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.55)]" />
                        <p className="text-[0.8rem] leading-5 text-slate-300">{rule}</p>
                      </div>
                    ))}
                    {profile.confluenceChecks?.length ? (
                      <div className="grid gap-1.25 sm:grid-cols-2">
                        {profile.confluenceChecks.map((check) => (
                          <div key={check} className="rounded-[0.36rem] border border-emerald-300/12 bg-emerald-300/6 px-2 py-1.5">
                            <p className="text-[0.72rem] font-semibold text-emerald-100">
                              {check}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="micro-label">Current Use</p>
                  <div className="mt-2 space-y-1.25">
                    {topSetups.length > 0 ? (
                      topSetups.map((setup) => (
                        <Link
                          key={setup.id}
                          href={`/assets/${setup.symbol}`}
                          className="signal-accent-surface block p-2.5 transition hover:border-cyan-300/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[0.84rem] font-semibold text-white">
                              {setup.symbol}
                            </p>
                            <span className="text-[0.76rem] font-semibold text-cyan-200">
                              {setup.score}
                            </span>
                          </div>
                          <p className="mt-1 text-[0.74rem] text-slate-400">
                            {setup.timeframe} / {setup.tradeability}
                          </p>
                        </Link>
                      ))
                    ) : (
                      <div className="signal-surface-soft p-2.5">
                        <p className="text-[0.8rem] leading-5 text-slate-400">
                          No ranked opportunities are currently assigned to this playbook.
                        </p>
                      </div>
                    )}
                    {matchedAssets.length > topSetups.length ? (
                      <p className="text-[0.74rem] text-slate-500">
                        Also assigned to {matchedAssets.length} monitored instruments.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
