/**
 * Spending policy for autonomous x402 payments.
 *
 * Deny-by-default: an empty `allowOrigins` list authorizes nothing.
 * Reservations (not post-hoc records) enforce caps, so two concurrent
 * payments cannot both slip under a nearly-exhausted window cap:
 * reserve → pay → commit, or reserve → failure → release.
 */

export type SpendPolicyConfig = {
  /**
   * Origins the payer may spend at, e.g. "https://api.example.com".
   * Compared against `new URL(target).origin`. Empty list denies everything.
   */
  allowOrigins: string[];
  /** Hard ceiling for a single payment, in atomic units. */
  maxAtomicPerRequest: bigint;
  /** Optional rolling-window ceiling across payments. */
  maxAtomicPerWindow?: {
    amountAtomic: bigint;
    windowSeconds: number;
  };
  /** Injectable clock (ms since epoch) for tests. */
  now?: () => number;
};

export type SpendDenialCode =
  | "origin_not_allowed"
  | "over_per_request_cap"
  | "over_window_cap"
  | "invalid_amount";

export class SpendPolicyError extends Error {
  readonly code: SpendDenialCode;
  readonly origin: string;
  readonly amountAtomic: bigint;

  constructor(code: SpendDenialCode, message: string, origin: string, amountAtomic: bigint) {
    super(message);
    this.name = "SpendPolicyError";
    this.code = code;
    this.origin = origin;
    this.amountAtomic = amountAtomic;
  }
}

export type SpendReservation = {
  /** Finalize the reservation; the amount stays counted for the window. */
  commit(): void;
  /** Cancel the reservation; the amount no longer counts against caps. */
  release(): void;
};

/** Optional context a guard may use to make a decision (e.g. resource-scoping). */
export type SpendContext = { resource?: string };

/**
 * The contract the paying agents depend on. Both SpendPolicy (origin +
 * amount caps) and CredentialPolicy (attenuable capabilities) implement
 * it, so either can be handed to createPayingFetch / createPayingToolCaller.
 */
export interface SpendGuard {
  reserve(origin: string, amountAtomic: bigint, context?: SpendContext): SpendReservation;
}

type LedgerEntry = {
  at: number;
  amountAtomic: bigint;
  state: "reserved" | "committed" | "released";
};

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

export class SpendPolicy {
  private readonly allowedOrigins: Set<string>;
  private readonly maxAtomicPerRequest: bigint;
  private readonly window?: { amountAtomic: bigint; windowMs: number };
  private readonly now: () => number;
  private readonly ledger: LedgerEntry[] = [];

  constructor(config: SpendPolicyConfig) {
    if (config.maxAtomicPerRequest < 0n) {
      throw new Error("maxAtomicPerRequest must be >= 0");
    }
    this.allowedOrigins = new Set(config.allowOrigins.map(normalizeOrigin));
    this.maxAtomicPerRequest = config.maxAtomicPerRequest;
    if (config.maxAtomicPerWindow) {
      if (config.maxAtomicPerWindow.windowSeconds <= 0) {
        throw new Error("maxAtomicPerWindow.windowSeconds must be > 0");
      }
      this.window = {
        amountAtomic: config.maxAtomicPerWindow.amountAtomic,
        windowMs: config.maxAtomicPerWindow.windowSeconds * 1000,
      };
    }
    this.now = config.now ?? (() => Date.now());
  }

  /** Sum of reserved + committed spend inside the current window. */
  spentInWindow(): bigint {
    this.prune();
    let total = 0n;
    for (const entry of this.ledger) {
      if (entry.state !== "released") total += entry.amountAtomic;
    }
    return total;
  }

  /**
   * Reserve spending authority for one payment. Throws SpendPolicyError
   * when any rule denies it. Callers MUST commit() after the payment
   * succeeds or release() after it fails.
   */
  reserve(targetOrigin: string, amountAtomic: bigint): SpendReservation {
    const origin = normalizeOrigin(targetOrigin);

    if (amountAtomic <= 0n) {
      throw new SpendPolicyError(
        "invalid_amount",
        `Refusing non-positive payment amount ${amountAtomic}`,
        origin,
        amountAtomic
      );
    }
    if (!this.allowedOrigins.has(origin)) {
      throw new SpendPolicyError(
        "origin_not_allowed",
        `Origin ${origin} is not in the spend allowlist`,
        origin,
        amountAtomic
      );
    }
    if (amountAtomic > this.maxAtomicPerRequest) {
      throw new SpendPolicyError(
        "over_per_request_cap",
        `Payment of ${amountAtomic} atomic exceeds per-request cap ${this.maxAtomicPerRequest}`,
        origin,
        amountAtomic
      );
    }
    if (this.window) {
      const spent = this.spentInWindow();
      if (spent + amountAtomic > this.window.amountAtomic) {
        throw new SpendPolicyError(
          "over_window_cap",
          `Payment of ${amountAtomic} atomic would exceed window cap ` +
            `${this.window.amountAtomic} (already reserved/spent: ${spent})`,
          origin,
          amountAtomic
        );
      }
    }

    const entry: LedgerEntry = {
      at: this.now(),
      amountAtomic,
      state: "reserved",
    };
    this.ledger.push(entry);

    return {
      commit: () => {
        if (entry.state === "reserved") entry.state = "committed";
      },
      release: () => {
        if (entry.state === "reserved") entry.state = "released";
      },
    };
  }

  private prune(): void {
    if (!this.window) {
      // Without a window cap the ledger is only evidence; keep it bounded.
      if (this.ledger.length > 10_000) this.ledger.splice(0, this.ledger.length - 10_000);
      return;
    }
    const cutoff = this.now() - this.window.windowMs;
    let firstLive = 0;
    while (
      firstLive < this.ledger.length &&
      this.ledger[firstLive].at < cutoff &&
      this.ledger[firstLive].state !== "reserved"
    ) {
      firstLive++;
    }
    if (firstLive > 0) this.ledger.splice(0, firstLive);
  }
}
