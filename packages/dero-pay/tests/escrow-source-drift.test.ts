import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EscrowContract } from "../src/escrow/contract.js";
import { createMockWalletRpc, createMockDaemonRpc } from "./mocks/rpc.js";
import type { WalletRpcClient } from "../src/rpc/wallet-rpc.js";
import type { DaemonRpcClient } from "../src/rpc/daemon-rpc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BAS_PATH = join(__dirname, "..", "contracts", "escrow.bas");

/**
 * Normalize DVM-BASIC source down to its executable body so two copies that
 * differ only in comments/whitespace compare equal:
 *  - drop blank lines and full-line `//` comments (with optional leading ws)
 *  - trim each remaining line
 *  - join with newlines
 *
 * This is deliberately strict about the *code* lines: it will FAIL if anyone
 * edits the Initialize/Deposit logic in one copy but not the other.
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

describe("escrow contract source drift", () => {
  it("embedded ESCROW_CONTRACT_SOURCE matches contracts/escrow.bas (normalized)", () => {
    const contract = new EscrowContract(
      createMockWalletRpc() as unknown as WalletRpcClient,
      createMockDaemonRpc() as unknown as DaemonRpcClient
    );

    const embedded = normalizeContractSource(contract.getSource());
    const onChainBas = normalizeContractSource(readFileSync(BAS_PATH, "utf8"));

    // Both copies must exist and be non-trivial.
    expect(embedded.length).toBeGreaterThan(0);
    expect(onChainBas.length).toBeGreaterThan(0);

    // Sanity: the security-hardened Deposit gates are present in both.
    expect(embedded).toContain('IF SIGNER() != LOAD("buyer") THEN GOTO 200');
    expect(embedded).toContain('IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200');

    // The load-bearing assertion: the executable bodies are byte-identical
    // after stripping the .bas ASCII-art header and `//` comments.
    expect(embedded).toBe(onChainBas);
  });
});
