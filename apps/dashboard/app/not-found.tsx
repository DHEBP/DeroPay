export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--ink)",
        color: "var(--bone)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480, padding: 40 }}>
        <div
          className="eyebrow"
          style={{ color: "var(--bone-mute)", marginBottom: 12 }}
        >
          404 · Not Found
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 92, color: "var(--bone)", marginBottom: 10 }}
        >
          Off the ledger.
        </h1>
        <p
          style={{
            color: "var(--bone-dim)",
            fontSize: 14,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          That page isn&apos;t in this book.
        </p>
        <a href="/" className="btn btn-ghost">
          ← Back to Overview
        </a>
      </div>
    </div>
  );
}
