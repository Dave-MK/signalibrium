import Image from "next/image";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="panel flex flex-col items-center gap-5 px-6 py-8 text-center">
        <Image
          src="/branding/signa-logo-white.svg"
          alt="Signalibrium"
          width={180}
          height={42}
          priority
        />
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="signal-button h-full w-1/2 animate-pulse rounded-full" />
        </div>
        <p className="text-sm text-slate-300">
          Loading your AI trading desk...
        </p>
      </div>
    </div>
  );
}
