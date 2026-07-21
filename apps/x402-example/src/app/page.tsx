export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>DeroPay x402 Example</h1>
      <p style={{ marginBottom: 8 }}>
        This app demonstrates x402-style protected resources with DeroPay receipts.
      </p>
      <p style={{ marginBottom: 8, color: "#b45309" }}>
        Note: paying via x402 publishes your wallet address on-chain — this demo is not anonymous.
      </p>
      <p style={{ marginBottom: 8 }}>
        Start by requesting <code>/api/protected/report</code> to receive a{" "}
        <code>402 Payment Required</code> challenge.
      </p>
      <p style={{ marginBottom: 8 }}>
        After the linked invoice is completed, issue a receipt via{" "}
        <code>/api/pay/receipts/issue</code> and retry with{" "}
        <code>X-DeroPay-Receipt</code> (or{" "}
        <code>Authorization: X402 proof="..."</code>).
      </p>
      <p style={{ marginBottom: 8 }}>
        Dynamic pricing example: request <code>/api/protected/inference?tokens=2500</code>
        to get a metered challenge based on requested tokens.
      </p>
      <p style={{ marginBottom: 8 }}>
        The inference route also enforces policy quotas:
        <code style={{ marginLeft: 6 }}>maxReceiptsPerDay</code> and{" "}
        <code>maxAtomicPerWindow</code>.
      </p>
      <p>
        See <code>apps/x402-example/README.md</code> for the exact curl flow.
      </p>
    </main>
  );
}
