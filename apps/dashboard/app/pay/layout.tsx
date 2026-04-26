export default function PublicPayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 16px",
        background: "#050807",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>{children}</div>
    </main>
  );
}
