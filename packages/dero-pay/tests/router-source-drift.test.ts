import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RouterContract } from "../src/router/contract.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BAS_PATH = join(__dirname, "..", "contracts", "payment-router.bas");

/**
 * Normalize DVM-BASIC source down to its executable body so two copies that
 * differ only in comments/whitespace compare equal:
 *  - drop blank lines and full-line `//` comments (with optional leading ws)
 *  - trim each remaining line
 *  - join with newlines
 *
 * Identical to the escrow drift normalizer: strict about the *code* lines, so it
 * FAILS if anyone edits the router logic in one copy but not the other. The
 * DEPLOYED source is the embedded `getSource()` copy — the `.bas` is the
 * readable mirror — so drift is the mirror silently going stale.
 */
function normalizeContractSource(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return false;
      if (trimmed.startsWith("//")) return false;
      return true;
    })
    .map((line) => line.trim())
    .join("\n");
}

describe("payment-router contract source drift", () => {
  it("embedded PAYMENT_ROUTER_SOURCE matches contracts/payment-router.bas (normalized)", () => {
    const router = new RouterContract(
      createMockWalletRpc() as unknown as WalletRpcClient,
      createMockDaemonRpc() as unknown as DaemonRpcClient
    );

    const embedded = normalizeContractSource(router.getSource());
    const onChainBas = normalizeContractSource(readFileSync(BAS_PATH, "utf8"));

    // Both copies must exist and be non-trivial.
    expect(embedded.length).toBeGreaterThan(0);
    expect(onChainBas.length).toBeGreaterThan(0);

    // Sanity: the shipped empty-invoiceId guard is present in both.
    expect(embedded).toContain("IF STRLEN(invoiceId) == 0 THEN GOTO 200");

    // The load-bearing assertion: the executable bodies are byte-identical
    // after stripping the .bas banner/comments.
    expect(embedded).toBe(onChainBas);
  });
});
