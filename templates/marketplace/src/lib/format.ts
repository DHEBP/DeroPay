const ATOMIC_PER_DERO = 1_000_000_000_000;

export function atomicFromDero(dero: number): bigint {
  return BigInt(Math.round(dero * ATOMIC_PER_DERO));
}

export function deroFromAtomic(atomic: string | bigint): number {
  const value = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  return Number(value) / ATOMIC_PER_DERO;
}

export function formatDero(atomic: string | bigint | number): string {
  const dero =
    typeof atomic === "number"
      ? atomic
      : deroFromAtomic(typeof atomic === "bigint" ? atomic : BigInt(atomic));
  return `${dero.toLocaleString("en-US", {
    minimumFractionDigits: dero >= 10 ? 2 : 4,
    maximumFractionDigits: dero >= 10 ? 2 : 4,
  })} DERO`;
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
