/**
 * Compare two DERO addresses ignoring the bech32 HRP and checksum.
 *
 * The DVM's ADDRESS_STRING() emits the mainnet "dero1" form even on
 * testnet/simulator chains whose wallets report the "deto1" form — same
 * key, different human-readable prefix. The trailing 6-char bech32
 * checksum also covers the HRP, so it differs between the two forms too.
 * We compare the data payload between prefix and checksum only.
 */
export function sameDeroAddress(a: string, b: string): boolean {
  const ca = deroAddressCore(a);
  const cb = deroAddressCore(b);
  // FAIL CLOSED: either side that is not a well-formed DERO address yields null.
  // Two nulls (or a null vs anything) must NEVER compare equal — otherwise a
  // malformed/empty on-chain payer string (e.g. a truncated or non-canonical
  // stringkey value) could be treated as matching the claimed payer. This
  // function gates payer_mismatch, so equality of non-addresses is unsafe.
  if (ca === null || cb === null) return false;
  return ca === cb;
}

// Data-length floor kept in lockstep with the schema's DERO_ADDR
// (/^(?:dero|deto)1[0-9a-z]{60,}$/, types.ts) and the client's ingest gate, so
// all three agree on what a DERO address is. The 6-char bech32 checksum sits at
// the end and covers the HRP, so it differs between the dero1/deto1 forms and
// is stripped before comparison; a valid address always has well more than 6
// data chars.
const DERO_ADDR_CORE = /^(?:dero|deto)1([0-9a-z]{60,})$/;

function deroAddressCore(addr: string): string | null {
  const m = DERO_ADDR_CORE.exec(addr);
  if (!m) return null;
  return m[1].slice(0, -6);
}
