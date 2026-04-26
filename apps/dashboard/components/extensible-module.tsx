"use client";

import { ExternalLink, GitBranch, Code2, Blocks } from "lucide-react";

/**
 * ExtensibleModule — placeholder for features scaffolded but not implemented.
 *
 * Shows a clear message: "This is here for you to build." No fake "Coming Soon"
 * promises. Just honest communication that the structure exists and merchants/
 * developers can extend it themselves.
 */

export interface ExtensibleModuleProps {
  /** Module name displayed in the header. */
  name: string;
  /** One-line description of what this module would do. */
  description: string;
  /** Optional longer explanation or use cases. */
  details?: string;
  /** Optional link to documentation. */
  docsUrl?: string;
  /** Optional link to example implementation. */
  exampleUrl?: string;
  /** Optional list of extension points / hooks available. */
  extensionPoints?: string[];
}

export function ExtensibleModule({
  name,
  description,
  details,
  docsUrl,
  exampleUrl,
  extensionPoints,
}: ExtensibleModuleProps) {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "48px auto",
        padding: "32px 28px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--ink-hair)",
        background: "var(--ink-elev)",
      }}
    >
      {/* Icon + Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--radius-sm)",
            background: "var(--dero-wash)",
            border: "1px solid var(--dero-hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Blocks size={20} color="var(--dero)" />
        </div>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--bone)",
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--bone-dim)",
            }}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Main message */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(103, 232, 249, 0.04)",
          border: "1px solid rgba(103, 232, 249, 0.12)",
          marginBottom: details || extensionPoints ? 20 : 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--bone)",
            lineHeight: 1.6,
          }}
        >
          This module is <strong style={{ color: "var(--dero)" }}>scaffolded for self-implementation</strong>.
          The UI structure and types are ready — add your own backend logic to enable it.
        </p>
      </div>

      {/* Details */}
      {details && (
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 12.5,
            color: "var(--bone-mute)",
            lineHeight: 1.6,
          }}
        >
          {details}
        </p>
      )}

      {/* Extension points */}
      {extensionPoints && extensionPoints.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Code2 size={12} color="var(--bone-mute)" />
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--bone-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Extension Points
            </span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {extensionPoints.map((point) => (
              <li
                key={point}
                style={{
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--ink-hair)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--bone-dim)",
                  letterSpacing: "0.02em",
                }}
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Links */}
      {(docsUrl || exampleUrl) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            paddingTop: 16,
            borderTop: "1px solid var(--ink-hair)",
          }}
        >
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--ink-hair)",
                background: "transparent",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--bone)",
                textDecoration: "none",
                transition: "border-color 120ms ease, background 120ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--dero-hair)";
                e.currentTarget.style.background = "var(--dero-wash)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--ink-hair)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ExternalLink size={12} />
              View Documentation
            </a>
          )}
          {exampleUrl && (
            <a
              href={exampleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--ink-hair)",
                background: "transparent",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--bone)",
                textDecoration: "none",
                transition: "border-color 120ms ease, background 120ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--dero-hair)";
                e.currentTarget.style.background = "var(--dero-wash)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--ink-hair)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <GitBranch size={12} />
              See Example
            </a>
          )}
        </div>
      )}
    </div>
  );
}
