import Link from "next/link";
import { Panel } from "./_components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Panel className="max-w-xl p-6 text-center sm:p-7">
        <p className="micro-label">Not Found</p>
        <h1 className="mt-3 text-2xl font-semibold text-white sm:text-[1.9rem]">
          That workstation view does not exist
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          The requested asset or trade ticket could not be resolved inside the
          current private prototype dataset.
        </p>
        <Link
          href="/"
          className="signal-button mt-5 inline-flex rounded-[0.62rem] px-4 py-2.5 text-sm font-semibold"
        >
          Return to Dashboard
        </Link>
      </Panel>
    </div>
  );
}
