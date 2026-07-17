import { describe, expect, it } from "vitest";
// Import by the PUBLISHED subpath (not ../src) — this exercises the package.json
// "exports" map against the built dist/, exactly as an npm consumer would.
import * as agent from "dero-pay/agent";
import * as x402 from "dero-pay/x402";

describe("published subpath exports resolve", () => {
  it("dero-pay/x402 exposes its public surface", () => {
    for (const name of [
      "withX402",
      "createPayingFetch",
      "SpendPolicy",
      "mintSpendCredential",
      "FacilitatorHttpClient",
      "build402Response",
      "X402UnpayableError",
      "X402PaymentRejectedError",
    ]) {
      expect((x402 as Record<string, unknown>)[name], `x402 missing ${name}`).toBeDefined();
    }
    expect(typeof x402.withX402).toBe("function");
  });

  it("dero-pay/agent exposes its public surface", () => {
    for (const name of [
      "createPayingFetch",
      "SpendPolicy",
      "mintSpendCredential",
      "parseInvoiceStatusResponse",
      "X402SettlementTimeoutError",
      "X402UnpayableError",
    ]) {
      expect((agent as Record<string, unknown>)[name], `agent missing ${name}`).toBeDefined();
    }
    expect(typeof agent.createPayingFetch).toBe("function");
  });
});
