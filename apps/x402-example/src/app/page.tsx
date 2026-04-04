export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>DeroPay x402 Example</h1>
      <p style={{ marginBottom: 8 }}>
        This app demonstrates x402-style protected resources with DeroPay receipts.
      </p>
      <p style={{ marginBottom: 8 }}>
        Start by requesting <code>/api/protected/report</code> to receive a{" "}
        <code>402 Payment Required</code> challenge.
      </p>
      <p style={{ marginBottom: 8 }}>
        After the linked invoice is completed, issue a receipt via{" "}
        <code>/api/pay/receipts/issue</code> and retry with{" "}
        <code>X-DeroPay-Receipt</code>.
      </p>
      <p>
        See <code>apps/x402-example/README.md</code> for the exact curl flow.
      </p>
    </main>
  );
}
