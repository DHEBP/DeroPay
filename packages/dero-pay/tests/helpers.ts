import type { Invoice, Payment } from "../src/core/types.js";
import type { EscrowRecord } from "../src/escrow/types.js";
import type { TransferEntry } from "../src/rpc/types.js";

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-001",
    name: "Test Invoice",
    description: "Test",
    amount: 500_000n, // 5 DERO (5 decimal places)
    status: "created",
    paymentId: 12345n,
    integratedAddress: "deti1q...",
    baseAddress: "dero1q...",
    ttlSeconds: 900,
    requiredConfirmations: 3,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    completedAt: null,
    amountReceived: 0n,
    payments: [],
    metadata: {},
    escrow: null,
    ...overrides,
  };
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    txid: "tx-abc123",
    amount: 500_000n,
    height: 100,
    topoHeight: 100,
    confirmations: 1,
    status: "detected",
    detectedAt: new Date().toISOString(),
    destinationPort: 12345n,
    ...overrides,
  };
}

export function makeEscrowRecord(
  overrides: Partial<EscrowRecord> = {}
): EscrowRecord {
  return {
    id: "esc-001",
    scid: "sc-abc123",
    deployTxid: "sc-abc123",
    status: "awaiting_deposit",
    sellerAddress: "dero1qseller...",
    arbitratorAddress: "dero1qarbitrator...",
    feeBasisPoints: 250,
    blockExpiration: 60,
    expectedAmount: 500_000n,
    depositAmount: null,
    buyerAddress: null,
    createdAt: new Date().toISOString(),
    depositedAt: null,
    resolvedAt: null,
    resolution: null,
    invoiceId: null,
    metadata: {},
    ...overrides,
  };
}

export function makeTransferEntry(
  overrides: Partial<TransferEntry> = {}
): TransferEntry {
  return {
    height: 100,
    topoheight: 100,
    blockhash: "block-hash-abc",
    txid: "tx-abc123",
    amount: 500_000,
    fees: 100,
    destination: "deti1q...",
    incoming: true,
    coinbase: false,
    payload_rpc: [],
    destination_port: 12345,
    source_port: 0,
    sender: "dero1qbuyer...",
    time: new Date().toISOString(),
    ...overrides,
  };
}
