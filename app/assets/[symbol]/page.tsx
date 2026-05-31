import { notFound } from "next/navigation";
import {
  backtests,
  getAssetBySymbol,
  getSetupsForSymbol,
  strategies,
} from "../../_data/mock-data";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRiskReward,
} from "../../_lib/format";
import { Sparkline } from "../../_components/sparkline";
import {
  ActionLink,
  KeyValue,
  PageHeader,
  Panel,
  StatusChip,
} from "../../_components/ui";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const asset = getAssetBySymbol(symbol);

  if (!asset) {
    notFound();
  }

  const assetSetups = getSetupsForSymbol(asset.symbol);
  const matchedStrategy = strategies.find(
    (strategy) => strategy.name === asset.activeStrategy,
  );
  const relatedBacktests = backtests.filter((backtest) => backtest.asset === asset.symbol);

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Asset Detail"
        title={`${asset.symbol} intelligence view`}
        description={`${asset.name} currently maps to the ${asset.activeStrategy} playbook. This page combines chart context, active setups, backtest confidence, regime assessment, risk profile, and AI explanation.`}
        action={<ActionLink href="/trade-tickets">Create Protected Ticket</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.25fr_0.8fr]">
        <Panel className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="micro-label">Price Structure</p>
              <h2 className="mt-2 text-[1.9rem] font-semibold text-white">
                {formatCurrency(asset.price)}
              </h2>
              <p
                className={`mt-2 text-sm ${
                  asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {formatPercent(asset.change24h, true)} over the latest session
              </p>
            </div>
            <StatusChip label={asset.regime.toUpperCase()} />
          </div>

          <div className="signal-surface mt-5 rounded-[0.62rem] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label="SMA 50" />
              <StatusChip label="SMA 200" />
              <StatusChip label="RSI" />
              <StatusChip label="ATR" />
            </div>
            <Sparkline data={asset.sparkline} className="mt-5 h-40 w-full sm:h-52" />
            <div className="mt-5 grid gap-[5px] sm:grid-cols-3">
              <KeyValue label="ATR" value={formatNumber(asset.atr)} />
              <KeyValue label="Liquidity" value={asset.liquidity} />
              <KeyValue label="Volatility" value={asset.volatility} />
            </div>
          </div>
        </Panel>

        <div className="panel-stack-5">
          <Panel className="p-4 sm:p-5">
            <p className="micro-label">Risk Profile</p>
            <div className="mt-4 grid gap-[5px]">
              <KeyValue
                label="Tradeability"
                value={asset.tradeable ? "Ticket ready" : "Watchlist only"}
                detail="Protected sizing is allowed only when regime and liquidity line up."
              />
              <KeyValue
                label="Forecast"
                value={asset.forecast}
                detail="Scenario framing generated from deterministic structure and regime context."
              />
              <KeyValue
                label="AI Explanation"
                value={asset.aiBias}
                detail="Grounded language, not prediction theatre."
              />
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <p className="micro-label">Strategy Match</p>
            <h2 className="mt-3 text-lg font-semibold text-white sm:text-[1.25rem]">
              {matchedStrategy?.name}
            </h2>
            <p className="mt-3 text-sm leading-5 text-slate-300">
              {matchedStrategy?.thesis}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {matchedStrategy?.bestRegimes.map((regime) => (
                <StatusChip key={regime} label={regime.toUpperCase()} />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Active Setups</p>
          <div className="mt-4 panel-stack-5">
            {assetSetups.map((setup) => (
              <div
                key={setup.id}
                className="signal-surface-soft rounded-[0.58rem] p-3.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{setup.strategy}</p>
                    <p className="text-sm text-slate-400">{setup.timeframe}</p>
                  </div>
                  <StatusChip label={setup.tradeability} />
                </div>
                <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
                  <KeyValue label="Entry" value={setup.entryZone} />
                  <KeyValue label="Stop" value={setup.stopLoss} />
                  <KeyValue label="Target" value={setup.takeProfit} />
                  <KeyValue
                    label="Risk/Reward"
                    value={formatRiskReward(setup.riskReward)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Backtest Summary</p>
          <div className="mt-4 panel-stack-5">
            {relatedBacktests.map((backtest) => (
              <div
                key={backtest.id}
                className="signal-surface-soft rounded-[0.58rem] p-3.5"
              >
                <p className="font-semibold text-white">{backtest.strategy}</p>
                <div className="mt-4 grid gap-[5px] sm:grid-cols-2">
                  <KeyValue
                    label="Total Return"
                    value={formatPercent(backtest.totalReturn)}
                  />
                  <KeyValue
                    label="Max Drawdown"
                    value={formatPercent(backtest.maxDrawdown)}
                  />
                  <KeyValue
                    label="Win Rate"
                    value={formatPercent(backtest.winRate)}
                  />
                  <KeyValue
                    label="Profit Factor"
                    value={backtest.profitFactor.toFixed(2)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
