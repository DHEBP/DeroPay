export default function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 700, marginBottom: "0.5rem" }}>404</h1>
        <p style={{ color: "#6b7280" }}>Page not found</p>
        <a href="/" style={{ display: "inline-block", marginTop: "1rem", color: "#10b981" }}>Back to Dashboard</a>
      </div>
    </div>
  );
}
