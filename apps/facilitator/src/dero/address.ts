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
  return deroAddressCore(a) === deroAddressCore(b);
}

function deroAddressCore(addr: string): string {
  const m = /^(?:dero|deto)1([0-9a-z]+)$/.exec(addr);
  if (!m) return addr;
  return m[1].length > 6 ? m[1].slice(0, -6) : m[1];
}
