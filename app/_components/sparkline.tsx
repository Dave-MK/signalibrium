type SparklineProps = {
  data: number[] | undefined;
  className?: string;
};

export function Sparkline({ data, className = "" }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className={`rounded-sm bg-white/[0.03] ${className}`} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 200;
  const height = 40;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = (data.at(-1) ?? 0) >= (data[0] ?? 0);
  const strokeColor = isUp ? "#34d399" : "#f59e0b";
  const fillStart = isUp ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.12)";

  const polyline = points.join(" ");
  const lastPoint = points.at(-1) ?? `${width},${height / 2}`;
  const fillPath = `M0,${height} L${polyline} L${lastPoint.split(",")[0]},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#spark-fill)" />
      <polyline points={polyline} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
