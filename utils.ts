export interface Position {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  change: number; // today's change per share
  currency: string;
  sector: string;
}

export interface FeedItem {
  time: string;
  title: string;
  detail: string;
}

export interface ApiPosition {
  symbol: string;
  name?: string;
  quantity: number;
  price: number;
  change?: number;
  pnl?: number;
  currency?: string;
  sector?: string;
}

export interface PortfolioResponse {
  positions?: ApiPosition[];
  cash?: number;
}

export const fallbackPositions: Position[] = [
  { symbol: "AAPL", name: "Apple Inc.", quantity: 120, price: 187.42, change: 1.18, currency: "USD", sector: "Tech" },
  { symbol: "MSFT", name: "Microsoft", quantity: 80, price: 422.15, change: -0.64, currency: "USD", sector: "Tech" },
  { symbol: "TSLA", name: "Tesla", quantity: 40, price: 192.48, change: 2.35, currency: "USD", sector: "Auto" },
  { symbol: "JNJ", name: "Johnson & Johnson", quantity: 65, price: 157.82, change: 0.42, currency: "USD", sector: "Healthcare" },
  { symbol: "UNH", name: "UnitedHealth", quantity: 30, price: 486.71, change: -1.14, currency: "USD", sector: "Healthcare" },
];

const changeFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatChange(change: number, price: number) {
  const sign = change >= 0 ? "+" : "-";
  const pct = ((Math.abs(change) / price) * 100).toFixed(2);
  return `${sign}${changeFormatter.format(Math.abs(change))} (${pct}%)`;
}

export function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Filters positions by symbol or name, updates the pill label, and returns the filtered list.
 * Accepts the current positions collection and an optional pill element to avoid cross-file globals.
 */
export function handleFilter(term: string, positions: Position[], pill?: HTMLDivElement | null) {
  const normalized = term.trim().toLowerCase();
  const filtered = normalized
    ? positions.filter(
        (p) => p.symbol.toLowerCase().includes(normalized) || p.name.toLowerCase().includes(normalized)
      )
    : positions;

  if (pill) pill.textContent = normalized ? `Filter: ${normalized}` : "All symbols";
  return filtered;
}

export function normalizePositions(data: PortfolioResponse, fallback: Position[] = fallbackPositions): Position[] {
  const incoming = data.positions || [];
  if (!incoming.length) return fallback;
  return incoming.map((p) => {
    const change = typeof p.change === "number" ? p.change : p.pnl && p.quantity ? p.pnl / p.quantity : 0;
    return {
      symbol: p.symbol,
      name: p.name || p.symbol,
      quantity: p.quantity,
      price: p.price,
      change,
      currency: p.currency || "USD",
      sector: p.sector || "N/A",
    };
  });
}
