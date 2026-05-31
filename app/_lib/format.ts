const compactCurrencyFormatter = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
  style: "currency",
  currency: "USD",
});

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
  style: "currency",
  currency: "USD",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value);
}

export function formatPercent(value: number, signed = false) {
  return `${new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 1,
    signDisplay: signed ? "always" : "auto",
  }).format(value)}%`;
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
