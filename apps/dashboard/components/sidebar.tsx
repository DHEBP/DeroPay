"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "~" },
  { href: "/invoices", label: "Invoices", icon: "#" },
  { href: "/escrow", label: "Escrow", icon: "&" },
  { href: "/settings", label: "Settings", icon: "*" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "240px",
        minHeight: "100vh",
        borderRight: "1px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        padding: "1.5rem 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "0 1.5rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            letterSpacing: "-0.025em",
          }}
        >
          <span style={{ color: "var(--accent)" }}>Dero</span>Pay
        </h1>
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            marginTop: "0.25rem",
          }}
        >
          Payment Dashboard
        </p>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.625rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                backgroundColor: isActive ? "var(--bg-hover)" : "transparent",
                borderLeft: isActive
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  width: "20px",
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "1rem",
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}
      >
        dero-pay v0.1.0
      </div>
    </aside>
  );
}
