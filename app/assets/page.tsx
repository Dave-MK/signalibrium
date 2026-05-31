import Link from "next/link";
import { watchlist } from "../_data/mock-data";
import { formatCurrency, formatPercent } from "../_lib/format";
import { PageHeader, Panel, StatusChip } from "../_components/ui";
import { Sparkline } from "../_components/sparkline";

export default function AssetsPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Assets"
        title="Focused watchlist, not infinite noise"
        description="The V1 seed universe is intentionally narrow so the scanner, backtester, and risk layers can prove signal quality before scale. Every asset here links into a detail workstation view."
      />

      <div className="grid gap-[5px] lg:grid-cols-2">
        {watchlist.map((asset) => (
          <Link key={asset.symbol} href={`/assets/${asset.symbol}`}>
            <Panel className="h-full p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="micro-label">{asset.assetClass}</p>
                  <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
                    {asset.symbol}
                  </h2>
                  <p className="mt-1 text-slate-400">{asset.name}</p>
                </div>
                <StatusChip label={asset.tradeable ? "TRADEABLE" : "WATCH"} />
              </div>

              <div className="mt-4 grid gap-[5px] sm:grid-cols-2">
                <div>
                  <p className="text-[1.8rem] font-semibold text-white">
                    {formatCurrency(asset.price)}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {formatPercent(asset.change24h, true)} over the latest session
                  </p>
                </div>
                <div className="text-sm leading-6 text-slate-300">
                  <p>Regime: {asset.regime}</p>
                  <p>Strategy match: {asset.activeStrategy}</p>
                  <p>Liquidity: {asset.liquidity}</p>
                </div>
              </div>

              <Sparkline data={asset.sparkline} className="mt-4 h-16 w-full sm:h-20" />

              <p className="mt-4 text-sm leading-5 text-slate-300">{asset.aiBias}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
