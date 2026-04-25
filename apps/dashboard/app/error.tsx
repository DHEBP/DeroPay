"use client";

export default function ErrorPage() {
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
          style={{ color: "var(--vermilion)", marginBottom: 12 }}
        >
          500 · Runtime Fault
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 72, color: "var(--bone)", marginBottom: 10 }}
        >
          Something broke.
        </h1>
        <p
          style={{
            color: "var(--bone-dim)",
            fontSize: 14,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          The ledger encountered an unexpected error. Your data is safe.
        </p>
        <a href="/" className="btn btn-ghost">
          ← Back to Overview
        </a>
      </div>
    </div>
  );
}
