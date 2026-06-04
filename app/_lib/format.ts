const currencyFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
  style: "currency",
  currency: "GBP",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absoluteValue < 1_000) {
    return formatCurrency(value);
  }

  const units = [
    { suffix: "B", threshold: 1_000_000_000 },
    { suffix: "M", threshold: 1_000_000 },
    { suffix: "K", threshold: 1_000 },
  ];

  const selectedUnit =
    units.find((unit) => absoluteValue >= unit.threshold) ?? units[units.length - 1];
  const scaledValue = absoluteValue / selectedUnit.threshold;
  const formattedScaledValue =
    scaledValue >= 100
      ? scaledValue.toFixed(0)
      : scaledValue.toFixed(1).replace(/\.0$/, "");

  return `${sign}£${formattedScaledValue}${selectedUnit.suffix}`;
}

export function formatPercent(value: number, signed = false) {
  return `${new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 1,
    signDisplay: signed ? "always" : "auto",
  }).format(value)}%`;
}

export function formatWinRate(value: number) {
  return formatPercent(value <= 1 ? value * 100 : value);
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
  }).format(value);
}

export function formatRiskReward(value: number) {
  return `1:${value.toFixed(1)}`;
}

export function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatChartAxisLabel(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
    timeZone: "Europe/London",
  }).format(new Date(value));
}
