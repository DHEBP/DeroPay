/**
 * O15d — DERO base-address bech32 -> raw-hex codec.
 *
 * Vectors are pinned to live daemon output: DERO.GetRandomAddress produced the
 * addresses, and the expected raw hex is rpc.NewAddress(addr).Compressed() from
 * the derohe module (fmt.Sprintf("%x", ...)). This is exactly what GetSC returns
 * for a string key stored on-chain via STORE(k, ADDRESS_RAW(addr)).
 */
import { describe, it, expect } from "vitest";
import {
  deroAddressToRawHex,
  tryDeroAddressToRawHex,
} from "../src/rpc/dero-address.js";

// [address, expected 33-byte compressed point as lowercase hex]
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  // Gold vector from the task spec.
  [
    "dero1qyhdlj6vz8ryudhcwlrmauhd9y25kwkw0artpmlp976c3dchsc3mqqgl0hr24",
    "2edfcb4c11c64e36f877c7bef2ed29154b3ace7f46b0efe12fb588b7178623b001",
  ],
  // Extra vectors generated live off the local mainnet daemon.
  [
    "dero1qyq2s2hnc9qk50uh0kl3cm8ae20cdf6jtgjzulhfwn4x0gcrs5u4sqgm0hr7n",
    "00a82af3c1416a3f977dbf1c6cfdca9f86a7525a242e7ee974ea67a30385395801",
  ],
  [
    "dero1qyg2ewekufpc80m9wcmsa8n5xtzqw4c6duxd2hun5ux6glsek2stwqqp7jd8j",
    "10acbb36e24383bf6576370e9e7432c407571a6f0cd55f93a70da47e19b2a0b700",
  ],
  [
    "dero1qy8l0zvwd2zdk4wm8uz9tjp9hfk6edlg39pfurusmtf5jg8qqhvqxqgy8cdhq",
    "0ff7898e6a84db55db3f0455c825ba6dacb7e889429e0f90dad34920e005d80301",
  ],
];

describe("O15d — deroAddressToRawHex", () => {
  for (const [address, rawHex] of VECTORS) {
    it(`decodes ${address.slice(0, 16)}… to its 33-byte point`, () => {
      const decoded = deroAddressToRawHex(address);
      expect(decoded).toBe(rawHex);
      // 33 bytes == 66 hex chars, always.
      expect(decoded).toHaveLength(66);
    });
  }

  it("output is lowercase hex (matches GetSC %x)", () => {
    const out = deroAddressToRawHex(VECTORS[0][0]);
    expect(out).toBe(out.toLowerCase());
  });

  it("rejects a testnet base (deto1…) address", () => {
    // A deto1 HRP (testnet base) must never decode as a mainnet base party.
    // This is the derohe dev address — a real, valid-checksum deto1.
    expect(() =>
      deroAddressToRawHex(
        "deto1qy0ehnqjpr0wxqnknyc66du2fsxyktppkr8m8e6jvplp954klfjz2qqdzcd8p"
      )
    ).toThrow(/HRP|dero/i);
  });

  it("rejects a mainnet integrated (deroi1…) address", () => {
    // Real integrated address (gold-vector base + payment-id arg), valid checksum.
    // Rejected on HRP — it carries a destination-port arg after the 33-byte point.
    expect(() =>
      deroAddressToRawHex(
        "deroi1qyhdlj6vz8ryudhcwlrmauhd9y25kwkw0artpmlp976c3dchsc3mqqdpvfz92xfs8ykpcpnp"
      )
    ).toThrow(/HRP|dero/i);
  });

  it("rejects a bad checksum (last char corrupted)", () => {
    const good = VECTORS[0][0];
    const bad = good.slice(0, -1) + (good.endsWith("4") ? "5" : "4");
    expect(() => deroAddressToRawHex(bad)).toThrow();
  });

  it("rejects garbage / non-bech32 input", () => {
    expect(() => deroAddressToRawHex("not-an-address")).toThrow();
    expect(() => deroAddressToRawHex("")).toThrow();
  });
});

describe("O15d — tryDeroAddressToRawHex (fail-closed)", () => {
  it("returns the raw hex for a valid mainnet base address", () => {
    expect(tryDeroAddressToRawHex(VECTORS[0][0])).toBe(VECTORS[0][1]);
  });

  it("returns null instead of throwing for bad input", () => {
    expect(tryDeroAddressToRawHex("not-an-address")).toBeNull();
    expect(tryDeroAddressToRawHex("")).toBeNull();
    expect(
      tryDeroAddressToRawHex(
        "deto1qy0ehnqjpr0wxqnknyc66du2fsxyktppkr8m8e6jvplp954klfjz2qqdzcd8p"
      )
    ).toBeNull();
  });
});
