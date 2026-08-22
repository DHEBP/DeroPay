export type PrepaidTransactionType = "TOP_UP" | "CHARGE" | "REFUND";

export type PrepaidBalance = {
  accountId: string;
  availableAtomic: bigint;
  reservedAtomic: bigint;
  updatedAt: string;
};

export type PrepaidTransaction = {
  id: string;
  accountId: string;
  type: PrepaidTransactionType;
  amountAtomic: bigint;
  balanceAfterAtomic: bigint;
  reference: string;
  relatedReference?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type PrepaidHoldState = "open" | "captured" | "released";

export type PrepaidHold = {
  id: string;
  accountId: string;
  reference: string;
  reservedAtomic: bigint;
  capturedAtomic: bigint;
  state: PrepaidHoldState;
  createdAt: string;
  finalizedAt?: string;
  metadata: Record<string, unknown>;
};

export type PrepaidTransactionPage = {
  items: PrepaidTransaction[];
  total: number;
  limit: number;
  offset: number;
};

export type PrepaidErrorCode =
  | "invalid_account"
  | "invalid_amount"
  | "invalid_reference"
  | "insufficient_balance"
  | "idempotency_conflict"
  | "hold_not_found"
  | "hold_not_open"
  | "capture_exceeds_reservation"
  | "charge_not_found"
  | "refund_exceeds_charge";

export class PrepaidError extends Error {
  constructor(
    readonly code: PrepaidErrorCode,
    message: string,
    readonly details: Record<string, string> = {},
  ) {
    super(message);
    this.name = "PrepaidError";
  }
}

export type CreditPrepaidInput = {
  id: string;
  accountId: string;
  amountAtomic: bigint;
  reference: string;
  relatedReference?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type ReservePrepaidInput = {
  id: string;
  accountId: string;
  amountAtomic: bigint;
  reference: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type CapturePrepaidInput = {
  holdId: string;
  transactionId: string;
  amountAtomic: bigint;
  finalizedAt: string;
  metadata: Record<string, unknown>;
};

export type ReleasePrepaidInput = {
  holdId: string;
  finalizedAt: string;
};

export type RefundPrepaidInput = {
  id: string;
  accountId: string;
  amountAtomic: bigint;
  reference: string;
  chargeReference: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type PrepaidCreditResult = {
  created: boolean;
  balance: PrepaidBalance;
  transaction: PrepaidTransaction;
};

export type PrepaidReservationResult = {
  created: boolean;
  balance: PrepaidBalance;
  hold: PrepaidHold;
};

export type PrepaidCaptureResult = {
  created: boolean;
  balance: PrepaidBalance;
  hold: PrepaidHold;
  transaction?: PrepaidTransaction;
};

export type PrepaidReleaseResult = {
  released: boolean;
  balance: PrepaidBalance;
  hold: PrepaidHold;
};

export interface PrepaidStore {
  creditPrepaid(input: CreditPrepaidInput): Promise<PrepaidCreditResult>;
  reservePrepaid(input: ReservePrepaidInput): Promise<PrepaidReservationResult>;
  capturePrepaid(input: CapturePrepaidInput): Promise<PrepaidCaptureResult>;
  releasePrepaid(input: ReleasePrepaidInput): Promise<PrepaidReleaseResult>;
  refundPrepaid(input: RefundPrepaidInput): Promise<PrepaidCreditResult>;
  getPrepaidBalance(accountId: string): Promise<PrepaidBalance>;
  getPrepaidTransaction(reference: string): Promise<PrepaidTransaction | null>;
  listPrepaidTransactions(
    accountId: string,
    options: { limit: number; offset: number },
  ): Promise<PrepaidTransactionPage>;
  listOpenPrepaidHolds(options?: {
    accountId?: string;
    limit?: number;
  }): Promise<PrepaidHold[]>;
}
