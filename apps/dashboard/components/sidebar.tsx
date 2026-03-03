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
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={24}
            height={24}
            style={{ flexShrink: 0 }}
          >
            <path
              d="M23,34.4v31.1l27,15.6,27-15.6v-31.1l-27-15.6-27,15.6ZM50,76.8l-6.1-3.5c.1-.8,2.3-14.4,2.4-15.8l-4.6-2.7v-9.6l8.3-4.8,8.3,4.8v9.6l-4.5,2.6c.2,1.4,2.3,15.1,2.4,15.8l-6.2,3.6ZM73.2,63.4l-13.4,7.7c0-.5-1.6-10.3-1.8-11.7l4.2-2.4v-14.1l-12.2-7-12.2,7v14.1l4.1,2.4c-.2,1.4-1.7,11.2-1.8,11.7l-13.3-7.7v-26.8l23.2-13.4,23.2,13.4v26.8Z"
              fill="#10b981"
            />
            <path
              d="M50,.3L7,25.2v49.7l43,24.8,43-24.8V25.2L50,.3ZM77,65.6l-27,15.6-27-15.6v-31.1l27-15.6,27,15.6v31.1Z"
              fill="var(--bg-secondary)"
            />
            <path
              d="M26.8,36.6v26.8l13.3,7.7c0-.4,1.6-10.3,1.8-11.7l-4.1-2.4v-14.1l12.2-7,12.2,7v14.1l-4.2,2.4c.2,1.4,1.7,11.2,1.8,11.7l13.4-7.7v-26.8l-23.2-13.4-23.2,13.4Z"
              fill="var(--bg-secondary)"
            />
            <path
              d="M58.3,54.8v-9.6l-8.3-4.8-8.3,4.8v9.6l4.6,2.7c-.2,1.4-2.3,15-2.4,15.8l6.1,3.5,6.2-3.6c-.1-.7-2.2-14.4-2.4-15.8l4.5-2.6Z"
              fill="var(--bg-secondary)"
            />
          </svg>
          <span>
            <span style={{ color: "var(--accent)" }}>Dero</span>Pay
          </span>
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
