import { journalEntries } from "../_data/mock-data";
import { formatDateLabel, formatPercent } from "../_lib/format";
import { PageHeader, Panel, StatusChip } from "../_components/ui";

export default function JournalPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Journal"
        title="Trade memory starts with honest review"
        description="The journal surface holds planned, simulated, taken, skipped, and closed trades alongside notes, emotion tags, and AI review. The goal is not just logging outcomes, but learning whether the process was clean."
      />

      <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Planned + Simulated", "12"],
          ["Target Hit", "4"],
          ["Stopped Out", "3"],
          ["Discipline Flags", "2"],
        ].map(([label, value]) => (
          <Panel key={label} className="p-4">
            <p className="micro-label">{label}</p>
            <p className="mt-2.5 text-[1.8rem] font-semibold text-white">{value}</p>
          </Panel>
        ))}
      </div>

      <Panel className="p-4 sm:p-5">
        <p className="micro-label">Recent Entries</p>
        <div className="mt-5 panel-stack-5">
          {journalEntries.map((entry) => (
            <div
              key={entry.id}
              className="signal-surface rounded-[0.62rem] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lg font-semibold text-white">{entry.asset}</p>
                    <StatusChip label={entry.status.toUpperCase()} />
                  </div>
                  <p className="text-sm text-slate-400">
                    {formatDateLabel(entry.date)} / P/L {formatPercent(entry.pnl, true)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.emotionTags.map((tag) => (
                    <span
                      key={tag}
                      className="signal-surface-soft rounded-full px-3 py-1 text-xs font-semibold text-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-[5px] xl:grid-cols-2">
                <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
                  <p className="micro-label">Notes</p>
                  <p className="mt-3 text-sm leading-5 text-slate-300">{entry.notes}</p>
                </div>
                <div className="signal-accent-surface rounded-[0.58rem] p-3.5">
                  <p className="micro-label">AI Review</p>
                  <p className="mt-3 text-sm leading-5 text-slate-200">
                    {entry.aiReview}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
