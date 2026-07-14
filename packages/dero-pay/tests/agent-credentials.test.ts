import { test, expect } from "vitest";
import {
  mintSpendCredential,
  attenuate,
  verifyCredentialSignature,
  CredentialPolicy,
  CredentialError,
  type SpendCredential,
} from "../src/agent/credentials";

// 32-byte hex root key (HMAC key).
const ROOT = "a".repeat(64);
const OTHER_ROOT = "b".repeat(64);
const ORIGIN = "https://api.example.com";

function baseCred(): SpendCredential {
  return mintSpendCredential({
    rootKeyHex: ROOT,
    id: "cred-1",
    caveats: [
      { type: "origin", value: ORIGIN },
      { type: "max-spend-atomic", value: "1000" },
    ],
  });
}

test("a freshly minted credential verifies against its root key", () => {
  expect(verifyCredentialSignature(baseCred(), ROOT)).toBe(true);
});

test("verification fails against the wrong root key", () => {
  expect(verifyCredentialSignature(baseCred(), OTHER_ROOT)).toBe(false);
});

test("tampering with a caveat value breaks the signature", () => {
  const cred = baseCred();
  const forged: SpendCredential = {
    ...cred,
    caveats: cred.caveats.map((c) =>
      c.type === "max-spend-atomic" ? { type: "max-spend-atomic", value: "999999999" } : c
    ),
  };
  expect(verifyCredentialSignature(forged, ROOT)).toBe(false);
});

test("reordering caveats breaks the signature", () => {
  const cred = baseCred();
  const reordered: SpendCredential = { ...cred, caveats: [...cred.caveats].reverse() };
  expect(verifyCredentialSignature(reordered, ROOT)).toBe(false);
});

test("attenuation is keyless and the result still verifies against the root", () => {
  const cred = baseCred();
  const narrowed = attenuate(cred, { type: "max-spend-atomic", value: "200" });
  expect(verifyCredentialSignature(narrowed, ROOT)).toBe(true);
  expect(narrowed.caveats.length).toBe(cred.caveats.length + 1);
});

test("PROPERTY: an attenuated credential can never exceed the parent cap", () => {
  const parent = mintSpendCredential({
    rootKeyHex: ROOT,
    id: "cred-cap",
    caveats: [{ type: "origin", value: ORIGIN }, { type: "max-spend-atomic", value: "1000" }],
  });
  // Worker tries to WIDEN by appending a bigger cap — attenuation is
  // append-only and "tightest wins", so the 1000 cap still binds.
  const attempted = attenuate(parent, { type: "max-spend-atomic", value: "1000000" });
  const policy = new CredentialPolicy(attempted, ROOT);

  policy.reserve(ORIGIN, 1000n).commit();
  expect(() => policy.reserve(ORIGIN, 1n)).toThrowError(CredentialError);
  try {
    policy.reserve(ORIGIN, 1n);
  } catch (e) {
    expect((e as CredentialError).code).toBe("over_credential_cap");
  }
});

test("attenuating DOWN tightens the cap below the parent", () => {
  const parent = mintSpendCredential({
    rootKeyHex: ROOT,
    id: "cred-down",
    caveats: [{ type: "origin", value: ORIGIN }, { type: "max-spend-atomic", value: "1000" }],
  });
  const worker = attenuate(parent, { type: "max-spend-atomic", value: "300" });
  const policy = new CredentialPolicy(worker, ROOT);

  policy.reserve(ORIGIN, 300n).commit();
  expect(() => policy.reserve(ORIGIN, 1n)).toThrowError(CredentialError);
});

test("CredentialPolicy refuses to construct on a bad signature", () => {
  const cred = baseCred();
  const forged = { ...cred, signature: "d".repeat(64) };
  expect(() => new CredentialPolicy(forged, ROOT)).toThrowError(CredentialError);
  try {
    new CredentialPolicy(forged, ROOT);
  } catch (e) {
    expect((e as CredentialError).code).toBe("bad_signature");
  }
});

test("origin caveat is enforced", () => {
  const policy = new CredentialPolicy(baseCred(), ROOT);
  expect(() => policy.reserve("https://evil.example.net", 10n)).toThrowError(CredentialError);
  try {
    policy.reserve("https://evil.example.net", 10n);
  } catch (e) {
    expect((e as CredentialError).code).toBe("origin_not_allowed");
  }
  policy.reserve(ORIGIN, 10n).commit(); // allowed origin passes
});

test("resource-prefix caveat scopes which resources may be paid", () => {
  const cred = mintSpendCredential({
    rootKeyHex: ROOT,
    id: "cred-res",
    caveats: [
      { type: "max-spend-atomic", value: "1000" },
      { type: "resource-prefix", value: "mcp:tool/" },
    ],
  });
  const policy = new CredentialPolicy(cred, ROOT);

  policy.reserve("https://any.host", 10n, { resource: "mcp:tool/audit" }).commit();
  expect(() =>
    policy.reserve("https://any.host", 10n, { resource: "https://api/other" })
  ).toThrowError(CredentialError);
  try {
    policy.reserve("https://any.host", 10n, { resource: "https://api/other" });
  } catch (e) {
    expect((e as CredentialError).code).toBe("resource_not_allowed");
  }
});

test("expiry caveat is enforced with the injected clock; earliest expiry wins", () => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const cred = mintSpendCredential({
    rootKeyHex: ROOT,
    id: "cred-exp",
    caveats: [
      { type: "max-spend-atomic", value: "1000" },
      { type: "expires-at", value: "2026-06-01T00:00:00Z" },
    ],
  });
  // Worker narrows expiry earlier — earliest wins.
  const narrowed = attenuate(cred, { type: "expires-at", value: "2026-02-01T00:00:00Z" });
  const policy = new CredentialPolicy(narrowed, ROOT, { now: () => clock });

  policy.reserve("https://any.host", 10n).commit(); // before Feb 1
  clock = Date.parse("2026-03-01T00:00:00Z"); // past the narrowed expiry
  expect(() => policy.reserve("https://any.host", 10n)).toThrowError(CredentialError);
  try {
    policy.reserve("https://any.host", 10n);
  } catch (e) {
    expect((e as CredentialError).code).toBe("expired");
  }
});

test("released reservations free credential budget; non-positive amounts refused", () => {
  const policy = new CredentialPolicy(baseCred(), ROOT);
  const r = policy.reserve(ORIGIN, 1000n);
  r.release();
  expect(policy.spent()).toBe(0n);
  policy.reserve(ORIGIN, 1000n).commit();
  expect(() => policy.reserve(ORIGIN, 0n)).toThrowError(CredentialError);
});
