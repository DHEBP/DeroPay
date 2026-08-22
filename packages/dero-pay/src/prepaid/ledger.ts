import { randomUUID } from "node:crypto";
import {
  PrepaidError,
  type PrepaidCaptureResult,
  type PrepaidCreditResult,
  type PrepaidReleaseResult,
  type PrepaidReservationResult,
  type PrepaidStore,
  type PrepaidTransaction,
  type PrepaidTransactionPage,
  type PrepaidBalance,
  type PrepaidHold,
} from "./types.js";

export type PrepaidEvent =
  | { type: "prepaid.top_up"; accountId: string; reference: string; amountAtomic: string }
  | { type: "prepaid.reserved"; accountId: string; reference: string; amountAtomic: string }
  | { type: "prepaid.captured"; accountId: string; reference: string; amountAtomic: string }
  | { type: "prepaid.released"; accountId: string; reference: string; amountAtomic: string }
  | { type: "prepaid.refunded"; accountId: string; reference: string; amountAtomic: string };

export type PrepaidLedgerConfig = {
  store: PrepaidStore;
  now?: () => Date;
  createId?: () => string;
  onEvent?: (event: PrepaidEvent) => void;
};

function requireText(name: "account" | "reference", value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new PrepaidError(
      name === "account" ? "invalid_account" : "invalid_reference",
      `${name} must not be empty`,
    );
  }
  return normalized;
}

function requirePositive(amountAtomic: bigint): bigint {
  if (amountAtomic <= 0n) {
    throw new PrepaidError("invalid_amount", "amountAtomic must be greater than zero", {
      amountAtomic: amountAtomic.toString(),
    });
  }
  return amountAtomic;
}

function metadataOf(value?: Record<string, unknown>): Record<string, unknown> {
  return value ? { ...value } : {};
}

export class PrepaidLedger {
  private readonly store: PrepaidStore;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly onEvent?: (event: PrepaidEvent) => void;

  constructor(config: PrepaidLedgerConfig) {
    this.store = config.store;
    this.now = config.now ?? (() => new Date());
    this.createId = config.createId ?? randomUUID;
    this.onEvent = config.onEvent;
  }

  async credit(input: {
    accountId: string;
    amountAtomic: bigint;
    reference: string;
    relatedReference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PrepaidCreditResult> {
    const accountId = requireText("account", input.accountId);
    const reference = requireText("reference", input.reference);
    const result = await this.store.creditPrepaid({
      id: this.createId(),
      accountId,
      amountAtomic: requirePositive(input.amountAtomic),
      reference,
      relatedReference: input.relatedReference
        ? requireText("reference", input.relatedReference)
        : undefined,
      createdAt: this.now().toISOString(),
      metadata: metadataOf(input.metadata),
    });
    if (result.created) {
      this.onEvent?.({
        type: "prepaid.top_up",
        accountId,
        reference,
        amountAtomic: input.amountAtomic.toString(),
      });
    }
    return result;
  }

  async reserve(input: {
    accountId: string;
    amountAtomic: bigint;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<PrepaidReservationResult> {
    const accountId = requireText("account", input.accountId);
    const reference = requireText("reference", input.reference);
    const result = await this.store.reservePrepaid({
      id: this.createId(),
      accountId,
      amountAtomic: requirePositive(input.amountAtomic),
      reference,
      createdAt: this.now().toISOString(),
      metadata: metadataOf(input.metadata),
    });
    if (result.created) {
      this.onEvent?.({
        type: "prepaid.reserved",
        accountId,
        reference,
        amountAtomic: input.amountAtomic.toString(),
      });
    }
    return result;
  }

  async capture(input: {
    holdId: string;
    amountAtomic: bigint;
    metadata?: Record<string, unknown>;
  }): Promise<PrepaidCaptureResult> {
    if (input.amountAtomic < 0n) {
      throw new PrepaidError("invalid_amount", "capture amountAtomic must be non-negative");
    }
    const result = await this.store.capturePrepaid({
      holdId: requireText("reference", input.holdId),
      transactionId: this.createId(),
      amountAtomic: input.amountAtomic,
      finalizedAt: this.now().toISOString(),
      metadata: metadataOf(input.metadata),
    });
    if (result.created) {
      this.onEvent?.({
        type: "prepaid.captured",
        accountId: result.hold.accountId,
        reference: result.hold.reference,
        amountAtomic: input.amountAtomic.toString(),
      });
    }
    return result;
  }

  async release(holdId: string): Promise<PrepaidReleaseResult> {
    const result = await this.store.releasePrepaid({
      holdId: requireText("reference", holdId),
      finalizedAt: this.now().toISOString(),
    });
    if (result.released) {
      this.onEvent?.({
        type: "prepaid.released",
        accountId: result.hold.accountId,
        reference: result.hold.reference,
        amountAtomic: result.hold.reservedAtomic.toString(),
      });
    }
    return result;
  }

  async refund(input: {
    accountId: string;
    amountAtomic: bigint;
    reference: string;
    chargeReference: string;
    metadata?: Record<string, unknown>;
  }): Promise<PrepaidCreditResult> {
    const accountId = requireText("account", input.accountId);
    const reference = requireText("reference", input.reference);
    const result = await this.store.refundPrepaid({
      id: this.createId(),
      accountId,
      amountAtomic: requirePositive(input.amountAtomic),
      reference,
      chargeReference: requireText("reference", input.chargeReference),
      createdAt: this.now().toISOString(),
      metadata: metadataOf(input.metadata),
    });
    if (result.created) {
      this.onEvent?.({
        type: "prepaid.refunded",
        accountId,
        reference,
        amountAtomic: input.amountAtomic.toString(),
      });
    }
    return result;
  }

  getBalance(accountId: string): Promise<PrepaidBalance> {
    return this.store.getPrepaidBalance(requireText("account", accountId));
  }

  getTransaction(reference: string): Promise<PrepaidTransaction | null> {
    return this.store.getPrepaidTransaction(requireText("reference", reference));
  }

  listTransactions(
    accountId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PrepaidTransactionPage> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);
    return this.store.listPrepaidTransactions(requireText("account", accountId), {
      limit,
      offset,
    });
  }

  listOpenHolds(options: { accountId?: string; limit?: number } = {}): Promise<PrepaidHold[]> {
    return this.store.listOpenPrepaidHolds({
      accountId: options.accountId
        ? requireText("account", options.accountId)
        : undefined,
      limit: Math.min(1_000, Math.max(1, options.limit ?? 100)),
    });
  }

  resolveHold(input: { holdId: string; action: "capture" | "release"; amountAtomic?: bigint }) {
    if (input.action === "release") return this.release(input.holdId);
    if (input.amountAtomic === undefined) {
      throw new PrepaidError("invalid_amount", "capture resolution requires amountAtomic");
    }
    return this.capture({ holdId: input.holdId, amountAtomic: input.amountAtomic });
  }
}
