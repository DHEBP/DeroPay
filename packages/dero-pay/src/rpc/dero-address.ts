/**
 * DERO base-address BECH32 -> raw-hex codec.
 *
 * O15d — decodes a mainnet base address ("dero1…") into the exact raw-hex form
 * that GetSC returns for a string key stored on-chain via `STORE(k, ADDRESS_RAW(a))`.
 * The escrow contract binds every party with `STORE("seller", ADDRESS_RAW(addr))`
 * etc., so on-chain state.seller/buyer/arbitrator are RAW hex — NOT the "dero1…"
 * bech32 the SDK holds. verifyBinding must compare both sides in the SAME (raw)
 * form or it never matches a real on-chain contract (misrouting fund recovery).
 *
 * Encoding spec (verified against derohe primary source — do NOT deviate):
 *   1. bech32-decode (STANDARD checksum, charset qpzry9x8gf2tvdw0s3jn54khce6mua7l,
 *      `polymod ^ 1` — NOT bech32m). DERO addresses exceed bech32's 90-char limit,
 *      so the limit MUST be raised (`bech32.decode(addr, 1023)`).
 *   2. fromWords(words) -> byte array.
 *   3. The FIRST byte is a version byte and MUST equal 1; strip it.
 *   4. The NEXT 33 bytes are the compressed public-key point. That 33-byte value,
 *      lowercase hex, is exactly what ADDRESS_RAW stores and what GetSC returns.
 *   5. HRP must be exactly "dero" (mainnet base). Reject "deto"/"deroi"/"deroproof"
 *      (testnet/integrated/proof) — escrow parties are mainnet base addresses only,
 *      consistent with assertDeroAddress in escrow/contract.ts. An integrated
 *      address also carries extra argument bytes after the 33-byte point.
 *
 * derohe sources:
 *   - rpc/address.go MarshalText/UnmarshalText = version(1)+PublicKey.EncodeCompressed()
 *   - dvm/dvm_functions.go:349 `dvm_address_raw` returns string(addr.Compressed())
 *     = the bare 33-byte point (no payment-ID args for a base address).
 *   - cmd/derod/rpc/rpc_dero_getsc.go:124 hex-encodes stored strings via `%x`.
 *
 * Gold vector (verified live: GetRandomAddress -> rpc.NewAddress().Compressed()):
 *   dero1qyhdlj6vz8ryudhcwlrmauhd9y25kwkw0artpmlp976c3dchsc3mqqgl0hr24
 *   -> 2edfcb4c11c64e36f877c7bef2ed29154b3ace7f46b0efe12fb588b7178623b001
 */
import { bech32 } from "bech32";

/** Mainnet base HRP. Testnet/integrated/proof HRPs are rejected. */
const DERO_MAINNET_HRP = "dero";
/** Version byte prefixing the compressed point (rpc/address.go). */
const DERO_ADDRESS_VERSION = 1;
/** Bytes in a compressed secp256k1-style point (what ADDRESS_RAW stores). */
const COMPRESSED_POINT_LEN = 33;
/**
 * DERO addresses are longer than the bech32 spec's default 90-char cap; raising
 * the decode limit is REQUIRED or valid addresses throw "Exceeds length limit".
 */
const DERO_BECH32_LIMIT = 1023;

/**
 * Decode a DERO mainnet base address ("dero1…") into the raw-hex 33-byte
 * compressed point exactly as GetSC surfaces it for an ADDRESS_RAW-stored key.
 *
 * THROWS on: wrong HRP, bad bech32 checksum, version byte !== 1, or fewer than
 * 33 point bytes. Use this where a decode failure should be surfaced; use
 * {@link tryDeroAddressToRawHex} for fail-closed comparisons.
 */
export function deroAddressToRawHex(address: string): string {
  if (typeof address !== "string" || address.length === 0) {
    throw new Error("deroAddressToRawHex: address must be a non-empty string");
  }

  // bech32.decode enforces the STANDARD checksum + throws on a corrupt one.
  const decoded = bech32.decode(address, DERO_BECH32_LIMIT);

  if (decoded.prefix !== DERO_MAINNET_HRP) {
    throw new Error(
      `deroAddressToRawHex: expected mainnet base HRP "dero", got "${decoded.prefix}" ` +
        `(testnet/integrated/proof addresses are not valid escrow parties)`
    );
  }

  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length < 1 + COMPRESSED_POINT_LEN) {
    throw new Error(
      `deroAddressToRawHex: decoded payload too short (${bytes.length} bytes; ` +
        `need >= ${1 + COMPRESSED_POINT_LEN})`
    );
  }

  const version = bytes[0];
  if (version !== DERO_ADDRESS_VERSION) {
    throw new Error(
      `deroAddressToRawHex: unexpected version byte ${version} (expected ${DERO_ADDRESS_VERSION})`
    );
  }

  // The 33 bytes after the version byte are the compressed point. A base address
  // carries nothing after it; an integrated address would append argument bytes,
  // but those are already excluded by the HRP check above.
  const point = bytes.slice(1, 1 + COMPRESSED_POINT_LEN);
  // Lowercase to match GetSC's `%x` output; explicit so the compare stays case-safe.
  return Buffer.from(point).toString("hex").toLowerCase();
}

/**
 * Fail-closed wrapper: returns the raw hex, or null if the address is not a
 * decodable mainnet base address. Used by verifyBinding so an un-decodable
 * expected party can never produce a spurious on-chain match.
 */
export function tryDeroAddressToRawHex(address: string): string | null {
  try {
    return deroAddressToRawHex(address);
  } catch {
    return null;
  }
}
