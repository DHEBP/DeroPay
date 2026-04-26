export function formatDero(atomic: string | undefined, precision = 5): string {
  if (!atomic) return "0." + "0".repeat(precision);
  const v = BigInt(atomic);
  const whole = v / 100_000n;
  const frac = v % 100_000n;
  const fracStr = frac.toString().padStart(5, "0").slice(0, precision);
  return `${formatWithCommas(whole)}.${fracStr}`;
}

export function formatWithCommas(n: bigint | number): string {
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const delta = (Date.now() - then) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function truncate(s: string, head = 6, tail = 4): string {
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
