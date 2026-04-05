export function formatX402AuthorizationHeader(proof: string): string {
  if (!proof || proof.trim().length === 0) {
    throw new Error("proof is required");
  }

  const escapedProof = proof.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `X402 proof="${escapedProof}"`;
}

export function parseX402AuthorizationHeader(header: string | null): string | null {
  if (!header) return null;

  const schemeMatch = /^\s*X402\s+(.+)$/i.exec(header);
  if (!schemeMatch) return null;

  const proofMatch = /(?:^|,\s*)proof="((?:\\.|[^"])*)"/i.exec(schemeMatch[1]);
  if (!proofMatch) return null;

  return proofMatch[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}
