/**
 * Port-free liveness: an atomically-written heartbeat file.
 *
 * The bridge's defining property is that it binds NO inbound listener — so it
 * cannot expose an HTTP /health endpoint without rebuilding the very surface it
 * exists to eliminate. Instead it writes a small JSON heartbeat (tmp file +
 * rename = atomic, no torn reads) that a `deropay-bridge status` subcommand or
 * a Docker HEALTHCHECK can read off disk.
 */

import { writeFileSync, renameSync, readFileSync } from "node:fs";

export type Heartbeat = {
  /** ISO timestamp of the last write. */
  ts: string;
  /** epoch ms, for staleness math without parsing the ISO string. */
  epochMs: number;
  pid: number;
  /** Durable dead-letter count — nonzero means undelivered webhooks are parked. */
  deadLetters: number;
  pending: number;
  delivering: number;
};

export function writeHeartbeat(path: string, hb: Heartbeat): void {
  const tmp = `${path}.tmp.${hb.pid}`;
  writeFileSync(tmp, JSON.stringify(hb), "utf8");
  renameSync(tmp, path); // atomic on the same filesystem
}

export function readHeartbeat(path: string): Heartbeat | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Heartbeat;
  } catch {
    return null;
  }
}

/**
 * Healthy = heartbeat exists, is fresh (within `maxAgeMs`), and has zero parked
 * dead-letters. Returns a reason on failure for the CLI to print.
 */
export function evaluateHealth(
  hb: Heartbeat | null,
  nowMs: number,
  maxAgeMs: number
): { healthy: boolean; reason?: string } {
  if (!hb) return { healthy: false, reason: "no heartbeat file" };
  const age = nowMs - hb.epochMs;
  if (age > maxAgeMs) {
    return { healthy: false, reason: `heartbeat stale by ${age - maxAgeMs}ms` };
  }
  if (hb.deadLetters > 0) {
    return { healthy: false, reason: `${hb.deadLetters} dead-lettered webhook(s)` };
  }
  return { healthy: true };
}
