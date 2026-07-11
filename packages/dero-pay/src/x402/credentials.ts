/**
 * Attenuable spending credentials — macaroon-style capabilities for
 * delegating a bounded slice of an agent's spending authority.
 *
 * A coordinating agent mints a credential from a root key with caveats
 * (max total spend, allowed origin, resource prefix, expiry). It hands
 * the credential to a worker/sub-agent, which can *attenuate* it — append
 * further caveats that only narrow authority — WITHOUT the root key. The
 * paying agent verifies the HMAC chain against the root key and enforces
 * every caveat locally before any transfer.
 *
 * This is the DERO analogue of L402's macaroon attenuation (NDSS 2014):
 * "a holder can add restrictions to an existing credential without
 * contacting the issuer." The key never leaves the issuer; a leaked
 * sub-credential can only ever be weaker than its parent.
 *
 * HMAC chain (identical construction to macaroons):
 *   sig_0 = HMAC(rootKey, id)
 *   sig_n = HMAC(sig_{n-1}, caveat_n)
 * The final signature authenticates the id + full ordered caveat list.
 * Appending a caveat is cheap and keyless; forging or reordering is not.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SpendReservation } from "./policy";

export type SpendCaveat =
  | { type: "max-spend-atomic"; value: string }
  | { type: "origin"; value: string }
  | { type: "resource-prefix"; value: string }
  | { type: "expires-at"; value: string }; // ISO 8601

export type SpendCredential = {
  /** Opaque credential id — also the first link of the HMAC chain. */
  id: string;
  caveats: SpendCaveat[];
  /** Hex HMAC over id + ordered caveats. */
  signature: string;
};

function hmacHex(keyHex: string, message: string): string {
  return createHmac("sha256", Buffer.from(keyHex, "hex")).update(message, "utf8").digest("hex");
}

function caveatMessage(c: SpendCaveat): string {
  return `${c.type}=${c.value}`;
}

function chainSignature(rootKeyHex: string, id: string, caveats: SpendCaveat[]): string {
  let sig = hmacHex(rootKeyHex, id);
  for (const c of caveats) {
    // Each link keys on the PREVIOUS signature, not the root — this is
    // what lets a holder attenuate without the root key.
    sig = hmacHex(sig, caveatMessage(c));
  }
  return sig;
}

/** Mint a credential from the root key. Requires the secret. */
export function mintSpendCredential(params: {
  rootKeyHex: string;
  id: string;
  caveats: SpendCaveat[];
}): SpendCredential {
  const caveats = [...params.caveats];
  return {
    id: params.id,
    caveats,
    signature: chainSignature(params.rootKeyHex, params.id, caveats),
  };
}

/**
 * Attenuate a credential by appending a caveat. Keyless: it extends the
 * HMAC chain from the current signature. The result is strictly weaker.
 */
export function attenuate(cred: SpendCredential, caveat: SpendCaveat): SpendCredential {
  return {
    id: cred.id,
    caveats: [...cred.caveats, caveat],
    signature: hmacHex(cred.signature, caveatMessage(caveat)),
  };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** Verify the HMAC chain against the root key. Does NOT check caveats. */
export function verifyCredentialSignature(cred: SpendCredential, rootKeyHex: string): boolean {
  const expected = chainSignature(rootKeyHex, cred.id, cred.caveats);
  return constantTimeEqualHex(expected, cred.signature);
}

export type CredentialDenialCode =
  | "bad_signature"
  | "expired"
  | "origin_not_allowed"
  | "resource_not_allowed"
  | "over_credential_cap"
  | "invalid_amount"
  | "malformed_caveat";

export class CredentialError extends Error {
  readonly code: CredentialDenialCode;
  constructor(code: CredentialDenialCode, message: string) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

/**
 * A spending guard backed by a verified credential. Implements the same
 * reserve()/commit()/release() contract as SpendPolicy, so it drops into
 * createPayingFetch / createPayingToolCaller interchangeably.
 *
 * The most restrictive caveat of each kind wins (attenuation can only
 * narrow): the effective cap is the minimum of all max-spend-atomic
 * caveats, the effective expiry the earliest, etc. Multiple origin or
 * resource-prefix caveats must ALL be satisfied.
 */
export class CredentialPolicy {
  private readonly cap: bigint | null;
  private readonly origins: string[];
  private readonly resourcePrefixes: string[];
  private readonly expiry: number | null;
  private readonly now: () => number;
  private readonly ledger: { amount: bigint; state: "reserved" | "committed" | "released" }[] = [];

  constructor(cred: SpendCredential, rootKeyHex: string, opts: { now?: () => number } = {}) {
    if (!verifyCredentialSignature(cred, rootKeyHex)) {
      throw new CredentialError("bad_signature", "Credential signature does not verify against the root key");
    }
    this.now = opts.now ?? (() => Date.now());

    let cap: bigint | null = null;
    const origins: string[] = [];
    const resourcePrefixes: string[] = [];
    let expiry: number | null = null;

    for (const c of cred.caveats) {
      switch (c.type) {
        case "max-spend-atomic": {
          if (!/^\d+$/.test(c.value)) {
            throw new CredentialError("malformed_caveat", `max-spend-atomic must be a non-negative integer: ${c.value}`);
          }
          const v = BigInt(c.value);
          cap = cap === null ? v : (v < cap ? v : cap); // tightest wins
          break;
        }
        case "origin":
          origins.push(new URL(c.value).origin);
          break;
        case "resource-prefix":
          resourcePrefixes.push(c.value);
          break;
        case "expires-at": {
          const t = Date.parse(c.value);
          if (Number.isNaN(t)) {
            throw new CredentialError("malformed_caveat", `expires-at is not a valid date: ${c.value}`);
          }
          expiry = expiry === null ? t : Math.min(expiry, t); // earliest wins
          break;
        }
        default:
          throw new CredentialError("malformed_caveat", `Unknown caveat type: ${(c as SpendCaveat).type}`);
      }
    }

    this.cap = cap;
    this.origins = origins;
    this.resourcePrefixes = resourcePrefixes;
    this.expiry = expiry;
  }

  /** Total reserved + committed spend under this credential. */
  spent(): bigint {
    let total = 0n;
    for (const e of this.ledger) if (e.state !== "released") total += e.amount;
    return total;
  }

  reserve(
    targetOrigin: string,
    amountAtomic: bigint,
    context?: { resource?: string }
  ): SpendReservation {
    if (amountAtomic <= 0n) {
      throw new CredentialError("invalid_amount", `Refusing non-positive payment amount ${amountAtomic}`);
    }
    if (this.expiry !== null && this.now() >= this.expiry) {
      throw new CredentialError("expired", "Credential has expired");
    }
    if (this.origins.length > 0) {
      const origin = new URL(targetOrigin).origin;
      if (!this.origins.includes(origin)) {
        throw new CredentialError("origin_not_allowed", `Origin ${origin} is not permitted by this credential`);
      }
    }
    if (this.resourcePrefixes.length > 0) {
      const resource = context?.resource ?? "";
      if (!this.resourcePrefixes.every((p) => resource.startsWith(p))) {
        throw new CredentialError(
          "resource_not_allowed",
          `Resource "${resource}" does not match every required prefix ${JSON.stringify(this.resourcePrefixes)}`
        );
      }
    }
    if (this.cap !== null && this.spent() + amountAtomic > this.cap) {
      throw new CredentialError(
        "over_credential_cap",
        `Payment of ${amountAtomic} would exceed the credential cap ${this.cap} (already ${this.spent()})`
      );
    }

    const entry: { amount: bigint; state: "reserved" | "committed" | "released" } = {
      amount: amountAtomic,
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
}
