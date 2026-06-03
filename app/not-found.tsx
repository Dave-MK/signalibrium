import Link from "next/link";
import { Panel } from "./_components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Panel className="max-w-xl p-4 text-center sm:p-5">
        <p className="micro-label">Not Found</p>
        <h1 className="mt-2 text-[1.45rem] font-semibold text-white sm:text-[1.7rem]">
          That desk view does not exist
        </h1>
        <p className="mt-3 text-[0.84rem] leading-5 text-slate-300">
          The requested asset, execution plan, or review record could not be resolved
          inside your current trading desk.
        </p>
        <Link
          href="/"
          className="signal-button mt-4 inline-flex rounded-[0.46rem] px-3.5 py-2 text-[0.84rem] font-semibold"
        >
          Return to My Desk
        </Link>
      </Panel>
    </div>
  );
}
