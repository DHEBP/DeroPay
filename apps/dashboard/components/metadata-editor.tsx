"use client";

/**
 * MetadataEditor — a small, drawer-friendly key/value editor for the
 * `metadata` column that lives on every first-class DeroPay entity.
 *
 * Design notes
 * ------------
 *  - Keys are plain strings; values are edited in a monospace textarea so
 *    JSON-shaped values (numbers, booleans, arrays, objects) can be pasted
 *    verbatim. On save, each value is tried as JSON.parse first — if that
 *    fails, the literal string is kept. This matches what most users
 *    actually mean when they type `42` or `"hello"` into the box.
 *  - Values that are not strings on load (numbers, booleans, nested
 *    objects) are JSON.stringify'd so the round-trip through parse on save
 *    returns the same type.
 *  - Duplicate keys are allowed in the UI (so users can reorder mid-edit)
 *    but on save, last-write-wins and a warning is shown next to every
 *    duplicate before the user commits.
 *  - Empty keys are skipped silently on save — they're assumed to be stubs
 *    from "+ Add row" that the user never filled in.
 *  - This component is self-contained: the parent passes a `value` object
 *    and an `onSave(next)` callback; wiring to an API route is the caller's
 *    responsibility. See `/api/pay/metadata` for the intended endpoint.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

type MetadataValue = Record<string, unknown>;

export type MetadataEditorProps = {
  /** Current metadata object. The editor never mutates this directly. */
  value: MetadataValue;
  /**
   * Persistence callback. Called with the next object after the user
   * clicks Save. The component awaits the promise (if any) to show a
   * spinner, then shows "Saved" on success or the thrown message on
   * failure.
   */
  onSave: (next: MetadataValue) => Promise<void> | void;
  /** When true, inputs are disabled but rows remain visible. */
  readonly?: boolean;
};

type Row = {
  /** Stable identity across re-renders so React keys stay predictable. */
  rid: number;
  key: string;
  /** Always a string in editor state — serialized on load, parsed on save. */
  valueRaw: string;
};

/**
 * Present a top-level value in a form the user can edit. Primitives pass
 * through; objects/arrays/numbers/booleans get JSON.stringify'd so the
 * round-trip through JSON.parse on save gives back the same type.
 */
function serializeValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Invert serializeValue — try JSON.parse first, fall back to the literal
 * string if parse fails. (A bare word like `hello` is not valid JSON and
 * would throw, which is the right call — the user typed a plain string.)
 */
function parseValue(s: string): unknown {
  const trimmed = s.trim();
  if (trimmed === "") return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return s;
  }
}

function rowsFromValue(v: MetadataValue): Row[] {
  let rid = 0;
  return Object.entries(v).map(([key, val]) => ({
    rid: rid++,
    key,
    valueRaw: serializeValue(val),
  }));
}

/**
 * Scan rows for duplicate keys; return the set of (lowercased) dup keys so
 * the renderer can badge each dup row. We don't block save — last-write
 * wins — but we warn before the click so nothing is silently dropped.
 */
function findDuplicateKeys(rows: Row[]): Set<string> {
  const seen = new Map<string, number>();
  const dups = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) dups.add(k);
  return dups;
}

export function MetadataEditor({
  value,
  onSave,
  readonly = false,
}: MetadataEditorProps) {
  const initialRows = useMemo(() => rowsFromValue(value ?? {}), [value]);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [nextRid, setNextRid] = useState<number>(initialRows.length);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const duplicates = useMemo(() => findDuplicateKeys(rows), [rows]);

  const updateRow = (rid: number, patch: Partial<Row>) => {
    setRows((rs) =>
      rs.map((r) => (r.rid === rid ? { ...r, ...patch } : r))
    );
    setDirty(true);
    setSavedAt(null);
    setError(null);
  };

  const removeRow = (rid: number) => {
    setRows((rs) => rs.filter((r) => r.rid !== rid));
    setDirty(true);
    setSavedAt(null);
    setError(null);
  };

  const addRow = () => {
    setRows((rs) => [...rs, { rid: nextRid, key: "", valueRaw: "" }]);
    setNextRid((n) => n + 1);
    setDirty(true);
    setSavedAt(null);
  };

  const buildNext = (): MetadataValue => {
    const out: MetadataValue = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue; // skip empty keys silently
      out[k] = parseValue(r.valueRaw);
    }
    return out;
  };

  const handleSave = async () => {
    if (!dirty || saving || readonly) return;
    setSaving(true);
    setError(null);
    try {
      const next = buildNext();
      await Promise.resolve(onSave(next));
      setSavedAt(Date.now());
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const hasDuplicates = duplicates.size > 0;

  return (
    <div className="surface" style={containerStyle}>
      <div style={headerStyle}>
        <span className="eyebrow" style={eyebrowStyle}>
          Metadata
        </span>
        <span style={rowCountStyle} className="mono">
          {rows.filter((r) => r.key.trim()).length} key
          {rows.filter((r) => r.key.trim()).length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={emptyStyle}>No metadata yet.</div>
      ) : (
        <div style={rowsWrapStyle}>
          {rows.map((r) => {
            const trimmed = r.key.trim();
            const isDup = trimmed !== "" && duplicates.has(trimmed);
            return (
              <div key={r.rid} style={rowStyle}>
                <div style={keyColStyle}>
                  <input
                    type="text"
                    value={r.key}
                    placeholder="key"
                    disabled={readonly}
                    onChange={(e) => updateRow(r.rid, { key: e.target.value })}
                    style={{
                      ...keyInputStyle,
                      ...(isDup ? keyInputDupStyle : null),
                    }}
                    className="mono"
                    aria-label="metadata key"
                  />
                  {isDup ? (
                    <span style={dupBadgeStyle} className="mono">
                      dup
                    </span>
                  ) : null}
                </div>
                <textarea
                  value={r.valueRaw}
                  placeholder='value — JSON allowed (e.g. 42, true, "x", {"a":1})'
                  disabled={readonly}
                  onChange={(e) =>
                    updateRow(r.rid, { valueRaw: e.target.value })
                  }
                  style={valueInputStyle}
                  className="mono"
                  rows={1}
                  aria-label="metadata value"
                />
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => removeRow(r.rid)}
                    style={removeBtnStyle}
                    title="Remove row"
                    aria-label="Remove row"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readonly && (
        <div style={footerStyle}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<Plus size={12} />}
            onClick={addRow}
          >
            Add row
          </Button>

          <AnimatePresence mode="wait">
            {hasDuplicates && (
              <motion.span
                key="dup-warn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={warningTextStyle}
              >
                <AlertCircle size={12} />
                <span>
                  duplicate keys will collapse — last value wins
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          <div style={{ flex: 1 }} />

          <AnimatePresence mode="wait">
            {error && (
              <motion.span
                key="err"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={errorTextStyle}
                role="alert"
              >
                <AlertCircle size={12} />
                <span>{error}</span>
              </motion.span>
            )}
            {savedAt && !dirty && !error && (
              <motion.span
                key="ok"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={savedTextStyle}
                role="status"
              >
                <Check size={12} />
                <span>Saved</span>
              </motion.span>
            )}
          </AnimatePresence>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!dirty || saving}
            onClick={handleSave}
            leftIcon={
              saving ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.8,
                    ease: "linear",
                  }}
                  style={{ display: "inline-flex" }}
                >
                  <Loader2 size={12} />
                </motion.span>
              ) : undefined
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — inline CSSProperties so the component has no extra CSS file and
// inherits the dashboard's design tokens via CSS custom properties.
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: "var(--radius)",
  border: "1px solid var(--ink-hair)",
  background: "var(--ink-elev)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 2,
};

const eyebrowStyle: React.CSSProperties = {
  color: "var(--bone-mute)",
  fontSize: 10,
};

const rowCountStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--bone-quiet)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const rowsWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 1fr) minmax(160px, 2.2fr) auto",
  gap: 6,
  alignItems: "start",
};

const keyColStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const keyInputStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 28,
  padding: "5px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--ink-hair)",
  background: "var(--ink-deep)",
  color: "var(--bone)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  outline: "none",
};

const keyInputDupStyle: React.CSSProperties = {
  borderColor: "var(--amber)",
};

const dupBadgeStyle: React.CSSProperties = {
  position: "absolute",
  right: 6,
  fontSize: 9,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--amber)",
  background: "rgba(0,0,0,0.2)",
  padding: "1px 5px",
  borderRadius: 3,
  pointerEvents: "none",
};

const valueInputStyle: React.CSSProperties = {
  minHeight: 28,
  padding: "5px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--ink-hair)",
  background: "var(--ink-deep)",
  color: "var(--bone)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  outline: "none",
  resize: "vertical",
};

const removeBtnStyle: React.CSSProperties = {
  height: 28,
  width: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-sm)",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--bone-quiet)",
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  padding: "12px 4px",
  fontSize: 12,
  color: "var(--bone-quiet)",
  fontStyle: "italic",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 2,
  flexWrap: "wrap",
};

const warningTextStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "var(--amber)",
  fontFamily: "var(--font-mono)",
};

const errorTextStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "var(--vermilion)",
  fontFamily: "var(--font-mono)",
};

const savedTextStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "var(--dero)",
  fontFamily: "var(--font-mono)",
};
