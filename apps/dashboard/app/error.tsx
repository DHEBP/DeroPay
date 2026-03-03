"use client";

export default function ErrorPage() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 700, marginBottom: "0.5rem" }}>Error</h1>
        <p style={{ color: "#6b7280" }}>Something went wrong</p>
        <a href="/" style={{ display: "inline-block", marginTop: "1rem", color: "#10b981" }}>Back to Dashboard</a>
      </div>
    </div>
  );
}
