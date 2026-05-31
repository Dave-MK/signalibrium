import Link from "next/link";
import { setups } from "../_data/mock-data";
import { formatRiskReward } from "../_lib/format";
import { ActionLink, PageHeader, Panel, StatusChip } from "../_components/ui";

const filterPills = [
  "Crypto + ETF focus",
  "4H and 1D",
  "Minimum score 75",
  "Tradeable only",
  "Protected sizing enabled",
];

export default function ScannerPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Scanner"
        title="Rank setups before emotion gets a vote"
        description="This shortlist mirrors the handover requirements: asset, strategy, score, risk, regime, entry zone, stop-loss, take-profit target, risk/reward, liquidity, and tradeability all sit on one screen."
        action={<ActionLink href="/trade-tickets">Prepared Tickets</ActionLink>}
      />

      <Panel className="p-4 sm:p-5">
        <p className="micro-label">Filter State</p>
        <div className="mt-3 flex flex-wrap gap-[5px]">
          {filterPills.map((pill) => (
            <span
              key={pill}
              className="signal-surface-soft rounded-full px-3.5 py-1.5 text-sm text-slate-200"
            >
              {pill}
            </span>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="micro-label">Scanner Results</p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
              Current ranked opportunities
            </h2>
          </div>
          <StatusChip label="BACKTESTED" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[1040px]">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Strategy</th>
                <th>Score</th>
                <th>Risk</th>
                <th>Regime</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>R/R</th>
                <th>Liquidity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {setups.map((setup) => (
                <tr key={setup.id}>
                  <td>
                    <Link
                      href={`/assets/${setup.symbol}`}
                      className="font-semibold text-white hover:text-cyan-200"
                    >
                      {setup.symbol}
                    </Link>
                    <p className="mt-1 text-sm text-slate-400">{setup.assetClass}</p>
                  </td>
                  <td className="text-slate-200">{setup.strategy}</td>
                  <td className="font-semibold text-white">{setup.score}</td>
                  <td className="text-slate-300">{setup.riskScore}/100</td>
                  <td>
                    <StatusChip label={setup.regime.toUpperCase()} />
                  </td>
                  <td className="text-slate-300">{setup.entryZone}</td>
                  <td className="text-slate-300">{setup.stopLoss}</td>
                  <td className="text-slate-300">{setup.takeProfit}</td>
                  <td className="text-slate-300">
                    {formatRiskReward(setup.riskReward)}
                  </td>
                  <td className="text-slate-300">{setup.liquidityStatus}</td>
                  <td>
                    <StatusChip label={setup.tradeability} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
