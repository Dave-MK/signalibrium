const brokerName = process.env.NEXT_PUBLIC_BROKER_NAME ?? "Open a Live Account";
const brokerUrl = process.env.NEXT_PUBLIC_BROKER_REFERRAL_URL ?? "";

export function AffiliateBrokerButton({ className }: { className?: string }) {
  if (!brokerUrl) return null;

  return (
    <a
      href={brokerUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40 hover:text-emerald-200 ${className ?? ""}`}
    >
      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
      Trade with {brokerName}
    </a>
  );
}
