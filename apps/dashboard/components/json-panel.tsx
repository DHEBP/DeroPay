"use client";

// Usage in a drawer footer:
// <JsonPanel json={invoice} label="Raw invoice" />
//
// Mount at the bottom of InvoiceDetailDrawer, EscrowDetailDrawer,
// CustomerDetailDrawer. The Wave 1C Timeline agent will do the mounting.

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Copy } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  json: unknown;
  label?: string;
  defaultOpen?: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function JsonPanel({
  json,
  label = "Raw JSON",
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const headerRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const { keyMeta, byteLabel, serialized } = useMemo(() => {
    let serialized = "";
    try {
      serialized = JSON.stringify(json, null, 2) ?? "";
    } catch {
      serialized = "";
    }

    let keyMeta = "—";
    if (Array.isArray(json)) {
      keyMeta = `${json.length} items`;
    } else if (json !== null && typeof json === "object") {
      keyMeta = `${Object.keys(json as object).length} keys`;
    }

    let byteLabel = "0 B";
    try {
      const raw = JSON.stringify(json) ?? "";
      const size = new Blob([raw]).size;
      byteLabel =
        size < 1024
          ? `${size} B`
          : `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    } catch {
      byteLabel = "— B";
    }

    return { keyMeta, byteLabel, serialized };
  }, [json]);

  const onToggle = useCallback(() => setOpen((o) => !o), []);

  const onHeaderKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open],
  );

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(
          serialized || String(json ?? ""),
        );
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        /* noop — clipboard may be unavailable */
      }
    },
    [serialized, json],
  );

  const highlighted = useMemo<ReactNode>(() => {
    if (json == null) return null;
    try {
      return highlightJson(json);
    } catch {
      return (
        <span style={{ color: "var(--bone-dim)" }}>
          {safeStringify(json)}
        </span>
      );
    }
  }, [json]);

  return (
    <div
      style={{
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
        background: "var(--ink-elev)",
        overflow: "hidden",
      }}
    >
      <button
        ref={headerRef}
        type="button"
        onClick={onToggle}
        onKeyDown={onHeaderKey}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          borderBottom: open
            ? "1px dashed var(--ink-hair)"
            : "1px dashed transparent",
          color: "var(--bone-dim)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          transition: "color 0.15s, border-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--bone)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--bone-dim)";
        }}
      >
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bone-quiet)",
          }}
        >
          <ChevronRight size={12} strokeWidth={2} />
        </motion.span>

        <span className="eyebrow" style={{ color: "var(--bone-dim)" }}>
          {label}
        </span>

        <span
          aria-hidden
          style={{
            flex: 1,
            height: 1,
            background: "var(--ink-hair)",
            opacity: 0.6,
          }}
        />

        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--bone-quiet)",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {keyMeta}
          <span style={{ margin: "0 6px", color: "var(--ink-hair-strong)" }}>
            ·
          </span>
          <span className="num">{byteLabel}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="pane"
            id={panelId}
            role="region"
            aria-label={label}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                position: "relative",
                background: "var(--ink-deep)",
              }}
            >
              <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? "Copied" : "Copy JSON"}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  zIndex: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 9px",
                  background: "var(--ink-elev-2)",
                  border: "1px solid var(--ink-hair-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: copied ? "var(--dero)" : "var(--bone-dim)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!copied) e.currentTarget.style.color = "var(--bone)";
                }}
                onMouseLeave={(e) => {
                  if (!copied)
                    e.currentTarget.style.color = "var(--bone-dim)";
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <pre
                style={{
                  margin: 0,
                  padding: "14px 18px",
                  paddingTop: 40,
                  maxHeight: 360,
                  overflowY: "auto",
                  overflowX: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: "var(--bone-dim)",
                  background: "transparent",
                  whiteSpace: "pre",
                  tabSize: 2,
                }}
              >
                {json == null ? (
                  <span
                    style={{
                      color: "var(--bone-quiet)",
                      fontStyle: "italic",
                    }}
                  >
                    No data
                  </span>
                ) : (
                  highlighted
                )}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Syntax highlighting — depth-first walker over the JSON value.
// Emits colored spans per token, indented with 2 spaces. If anything throws
// (e.g. circular reference) the caller falls back to plain serialization.
// ---------------------------------------------------------------------------

const TOKEN: Record<string, CSSProperties> = {
  key: { color: "var(--dero)" },
  string: { color: "var(--bone)" },
  number: { color: "var(--amber)" },
  boolean: { color: "var(--amber)" },
  null: { color: "var(--bone-mute)", fontStyle: "italic" },
  punct: { color: "var(--bone-quiet)" },
};

function highlightJson(value: unknown): ReactNode {
  const seen = new WeakSet<object>();
  let keyCounter = 0;
  const nextKey = () => `t${keyCounter++}`;

  const pad = (depth: number) => " ".repeat(depth * 2);

  const render = (v: unknown, depth: number): ReactNode => {
    if (v === null) {
      return (
        <span key={nextKey()} style={TOKEN.null}>
          null
        </span>
      );
    }
    if (v === undefined) {
      return (
        <span key={nextKey()} style={TOKEN.null}>
          undefined
        </span>
      );
    }
    const t = typeof v;
    if (t === "string") {
      return (
        <span key={nextKey()} style={TOKEN.string}>
          {escapeStringLiteral(v as string)}
        </span>
      );
    }
    if (t === "number") {
      const n = v as number;
      return (
        <span key={nextKey()} style={TOKEN.number}>
          {Number.isFinite(n) ? String(n) : "null"}
        </span>
      );
    }
    if (t === "boolean") {
      return (
        <span key={nextKey()} style={TOKEN.boolean}>
          {String(v)}
        </span>
      );
    }
    if (t === "bigint") {
      return (
        <span key={nextKey()} style={TOKEN.number}>
          {(v as bigint).toString()}
        </span>
      );
    }
    if (t !== "object") {
      // functions, symbols — treat as null in JSON semantics
      return (
        <span key={nextKey()} style={TOKEN.null}>
          null
        </span>
      );
    }

    const obj = v as object;
    if (seen.has(obj)) {
      return (
        <span key={nextKey()} style={TOKEN.null}>
          &quot;[Circular]&quot;
        </span>
      );
    }
    seen.add(obj);

    if (Array.isArray(v)) {
      if (v.length === 0) {
        return (
          <span key={nextKey()} style={TOKEN.punct}>
            []
          </span>
        );
      }
      const parts: ReactNode[] = [];
      parts.push(
        <span key={nextKey()} style={TOKEN.punct}>
          [
        </span>,
      );
      parts.push("\n");
      v.forEach((item, i) => {
        parts.push(pad(depth + 1));
        parts.push(render(item, depth + 1));
        if (i < v.length - 1) {
          parts.push(
            <span key={nextKey()} style={TOKEN.punct}>
              ,
            </span>,
          );
        }
        parts.push("\n");
      });
      parts.push(pad(depth));
      parts.push(
        <span key={nextKey()} style={TOKEN.punct}>
          ]
        </span>,
      );
      return <span key={nextKey()}>{parts}</span>;
    }

    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <span key={nextKey()} style={TOKEN.punct}>
          {"{}"}
        </span>
      );
    }
    const parts: ReactNode[] = [];
    parts.push(
      <span key={nextKey()} style={TOKEN.punct}>
        {"{"}
      </span>,
    );
    parts.push("\n");
    entries.forEach(([k, val], i) => {
      parts.push(pad(depth + 1));
      parts.push(
        <span key={nextKey()} style={TOKEN.key}>
          {escapeStringLiteral(k)}
        </span>,
      );
      parts.push(
        <span key={nextKey()} style={TOKEN.punct}>
          :{" "}
        </span>,
      );
      parts.push(render(val, depth + 1));
      if (i < entries.length - 1) {
        parts.push(
          <span key={nextKey()} style={TOKEN.punct}>
            ,
          </span>,
        );
      }
      parts.push("\n");
    });
    parts.push(pad(depth));
    parts.push(
      <span key={nextKey()} style={TOKEN.punct}>
        {"}"}
      </span>,
    );
    return <span key={nextKey()}>{parts}</span>;
  };

  return render(value, 0);
}

function escapeStringLiteral(s: string): string {
  // Minimal JSON-ish escape — keeps output copy-pasteable.
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20)
      out += `\\u${c.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  out += '"';
  return out;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return "[unserializable]";
  }
}
