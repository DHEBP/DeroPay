"use client";

/**
 * Phase 3 #36 — Interactive API shell.
 *
 * Two-column layout:
 *   • Left rail : scrollable, grouped endpoint list (arrow-key navigable).
 *   • Right pane: request builder (path params, query params, body textarea)
 *                 stacked over an aria-live response viewer.
 *
 * Conventions mirrored from the rest of the developers page:
 *   - Mono font + ink/bone CSS variables for the terminal aesthetic.
 *   - Reuses `JsonPanel` for collapsible response-body / response-header views.
 *   - Sends the `deropay_mode` cookie automatically (it's same-origin, so
 *     `credentials: "same-origin"` is the browser default — but we spell it
 *     out for clarity).
 *
 * Non-goals: full Postman, auth flows, saved environments, request history
 * persisted beyond the current tab. See Phase 3 #36 ticket for scope.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AlertTriangle, Copy, PlayCircle, Sparkles } from "lucide-react";
import { JsonPanel } from "@/components/json-panel";
import { useToast } from "@/components/toast";
import {
  API_EXAMPLES,
  findEndpoint,
  groupedEndpoints,
  type ApiEndpoint,
  type HttpMethod,
} from "@/lib/api-catalogue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResponseCapture = {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  bodyIsJson: boolean;
  rawBody: string;
};

type ErrorCapture = {
  message: string;
};

// ---------------------------------------------------------------------------
// Method -> color token (matches existing status-pill hues).
// ---------------------------------------------------------------------------

const METHOD_TONE: Record<HttpMethod, { fg: string; bg: string }> = {
  GET: { fg: "var(--dero)", bg: "var(--dero-wash)" },
  POST: { fg: "var(--bone)", bg: "var(--ink-elev-2)" },
  PATCH: { fg: "var(--amber, #c39a4e)", bg: "var(--ink-elev-2)" },
  DELETE: { fg: "var(--vermilion, #b85b3a)", bg: "var(--ink-elev-2)" },
};

function statusTone(status: number): string {
  if (status === 0) return "var(--bone-quiet)";
  if (status >= 500) return "var(--vermilion, #b85b3a)";
  if (status >= 400) return "var(--amber, #c39a4e)";
  if (status >= 300) return "var(--amber, #c39a4e)";
  if (status >= 200) return "var(--dero)";
  return "var(--bone-dim)";
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function ApiShell() {
  const { toast } = useToast();

  const groups = useMemo(() => groupedEndpoints(), []);
  const flatEndpoints = useMemo(() => groups.flatMap((g) => g.endpoints), [groups]);

  const [selectedId, setSelectedId] = useState<string>(
    flatEndpoints[0]?.id ?? ""
  );
  const selected = findEndpoint(selectedId);

  // Per-endpoint input state lives keyed so switching endpoints preserves
  // what the merchant typed. Clearing is deliberate via "Reset".
  const [pathValues, setPathValues] = useState<Record<string, Record<string, string>>>({});
  const [queryValues, setQueryValues] = useState<Record<string, Record<string, string>>>({});
  const [bodyValues, setBodyValues] = useState<Record<string, string>>({});
  const [confirmedDestructive, setConfirmedDestructive] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ResponseCapture | null>(null);
  const [errorState, setErrorState] = useState<ErrorCapture | null>(null);

  // Ensure each endpoint starts seeded with its defaults on first visit.
  useEffect(() => {
    if (!selected) return;
    setQueryValues((prev) => {
      if (prev[selected.id]) return prev;
      const seeded: Record<string, string> = {};
      for (const q of selected.queryParams ?? []) {
        seeded[q.name] = q.default ?? "";
      }
      return { ...prev, [selected.id]: seeded };
    });
    setPathValues((prev) => {
      if (prev[selected.id]) return prev;
      const seeded: Record<string, string> = {};
      for (const p of selected.pathParams ?? []) seeded[p] = "";
      return { ...prev, [selected.id]: seeded };
    });
    setBodyValues((prev) => {
      if (prev[selected.id] !== undefined) return prev;
      return { ...prev, [selected.id]: selected.bodySchema ?? "" };
    });
  }, [selected]);

  const currentPath = selected ? pathValues[selected.id] ?? {} : {};
  const currentQuery = selected ? queryValues[selected.id] ?? {} : {};
  const currentBody = selected ? bodyValues[selected.id] ?? "" : "";
  const currentConfirmed = selected ? Boolean(confirmedDestructive[selected.id]) : false;

  // -----------------------------------------------------------------------
  // Left rail — keyboard navigation.
  // -----------------------------------------------------------------------

  const listRef = useRef<HTMLDivElement>(null);

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const idx = flatEndpoints.findIndex((ep) => ep.id === selectedId);
      if (idx < 0) return;
      const next =
        e.key === "ArrowDown"
          ? Math.min(flatEndpoints.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      const target = flatEndpoints[next];
      if (target) {
        setSelectedId(target.id);
        // Scroll newly selected row into view inside the rail.
        requestAnimationFrame(() => {
          const el = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-endpoint-id="${target.id}"]`
          );
          el?.scrollIntoView({ block: "nearest" });
        });
      }
    },
    [flatEndpoints, selectedId]
  );

  // -----------------------------------------------------------------------
  // URL + cURL composition helpers.
  // -----------------------------------------------------------------------

  const composeUrl = useCallback(
    (ep: ApiEndpoint): string => {
      let url = ep.path;
      for (const p of ep.pathParams ?? []) {
        const v = currentPath[p] ?? "";
        url = url.replace(`:${p}`, encodeURIComponent(v));
      }
      const qs = new URLSearchParams();
      for (const q of ep.queryParams ?? []) {
        const v = currentQuery[q.name] ?? "";
        if (v.trim().length > 0) qs.set(q.name, v.trim());
      }
      const qsStr = qs.toString();
      if (qsStr) url += `?${qsStr}`;
      return url;
    },
    [currentPath, currentQuery]
  );

  const composedUrl = selected ? composeUrl(selected) : "";

  const composeCurl = useCallback(
    (ep: ApiEndpoint): string => {
      const relative = composeUrl(ep);
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://your-deropay.example";
      const parts: string[] = [`curl -X ${ep.method} '${origin}${relative}'`];
      parts.push(`  -H 'X-DeroPay-ApiKey: <API_KEY>'`);
      if ((ep.method === "POST" || ep.method === "PATCH") && ep.bodySchema !== undefined) {
        parts.push(`  -H 'Content-Type: application/json'`);
        const body = (currentBody || "").trim();
        if (body) parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
      }
      return parts.join(" \\\n");
    },
    [composeUrl, currentBody]
  );

  // -----------------------------------------------------------------------
  // Request execution.
  // -----------------------------------------------------------------------

  const execute = useCallback(async () => {
    if (!selected || loading) return;
    if (selected.destructive && !currentConfirmed) {
      toast({
        title: "Confirm destructive action",
        description: "Tick the confirm box to enable Execute.",
        tone: "warn",
      });
      return;
    }

    // Validate JSON body shape before sending.
    let bodyToSend: string | undefined;
    if (
      (selected.method === "POST" || selected.method === "PATCH") &&
      currentBody.trim().length > 0
    ) {
      try {
        JSON.parse(currentBody);
        bodyToSend = currentBody;
      } catch (err) {
        setErrorState({
          message: `Invalid JSON in request body: ${
            err instanceof Error ? err.message : "parse error"
          }`,
        });
        setResponse(null);
        return;
      }
    }

    setLoading(true);
    setErrorState(null);

    const url = composeUrl(selected);
    const started = performance.now();

    try {
      const init: RequestInit = {
        method: selected.method,
        // `same-origin` is the browser default for same-origin requests;
        // spelling it out makes the cookie-forwarding intent explicit.
        credentials: "same-origin",
        headers: bodyToSend
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body: bodyToSend,
      };

      const res = await fetch(url, init);
      const duration = performance.now() - started;

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });

      const rawBody = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      let body: unknown = rawBody;
      let bodyIsJson = false;
      if (rawBody.length > 0 && ct.includes("application/json")) {
        try {
          body = JSON.parse(rawBody);
          bodyIsJson = true;
        } catch {
          body = rawBody;
          bodyIsJson = false;
        }
      } else if (rawBody.length === 0) {
        body = null;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        durationMs: Math.round(duration),
        headers,
        body,
        bodyIsJson,
        rawBody,
      });
    } catch (err) {
      setErrorState({
        message: err instanceof Error ? err.message : "Network error",
      });
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [selected, loading, currentBody, currentConfirmed, composeUrl, toast]);

  // -----------------------------------------------------------------------
  // Cmd/Ctrl+Enter hotkey.
  // -----------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        execute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute]);

  // -----------------------------------------------------------------------
  // Example runs.
  // -----------------------------------------------------------------------

  const applyExample = useCallback((exampleId: string) => {
    const ex = API_EXAMPLES.find((e) => e.id === exampleId);
    if (!ex) return;
    const ep = findEndpoint(ex.endpointId);
    if (!ep) return;

    setSelectedId(ep.id);
    if (ex.queryValues) {
      setQueryValues((prev) => ({
        ...prev,
        [ep.id]: { ...(prev[ep.id] ?? {}), ...ex.queryValues },
      }));
    }
    if (ex.pathValues) {
      setPathValues((prev) => ({
        ...prev,
        [ep.id]: { ...(prev[ep.id] ?? {}), ...ex.pathValues },
      }));
    }
    if (ex.body !== undefined) {
      setBodyValues((prev) => ({ ...prev, [ep.id]: ex.body ?? "" }));
    }
  }, []);

  // -----------------------------------------------------------------------
  // Clipboard helpers.
  // -----------------------------------------------------------------------

  const copyCurl = useCallback(async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(composeCurl(selected));
      toast({ title: "Copied as cURL", tone: "success" });
    } catch {
      toast({ title: "Couldn't copy", tone: "error" });
    }
  }, [selected, composeCurl, toast]);

  const resetInputs = useCallback(() => {
    if (!selected) return;
    const seeded: Record<string, string> = {};
    for (const q of selected.queryParams ?? []) seeded[q.name] = q.default ?? "";
    const path: Record<string, string> = {};
    for (const p of selected.pathParams ?? []) path[p] = "";
    setQueryValues((prev) => ({ ...prev, [selected.id]: seeded }));
    setPathValues((prev) => ({ ...prev, [selected.id]: path }));
    setBodyValues((prev) => ({ ...prev, [selected.id]: selected.bodySchema ?? "" }));
    setConfirmedDestructive((prev) => ({ ...prev, [selected.id]: false }));
    setResponse(null);
    setErrorState(null);
  }, [selected]);

  // -----------------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------------

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: 16,
        minHeight: 560,
      }}
    >
      {/* ==================== LEFT RAIL ==================== */}
      <div
        ref={listRef}
        role="listbox"
        aria-label="API endpoints"
        tabIndex={0}
        onKeyDown={onListKeyDown}
        style={{
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius-sm)",
          background: "var(--ink-elev)",
          maxHeight: 640,
          overflowY: "auto",
          outline: "none",
        }}
      >
        {groups.map((g) => (
          <div key={g.group}>
            <div
              style={{
                padding: "10px 14px 6px",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--bone-quiet)",
                borderBottom: "1px dashed var(--ink-hair)",
                background: "var(--ink-elev-1)",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              {g.group}
            </div>
            {g.endpoints.map((ep) => {
              const active = ep.id === selectedId;
              const tone = METHOD_TONE[ep.method];
              return (
                <button
                  key={ep.id}
                  type="button"
                  data-endpoint-id={ep.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(ep.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: active ? "var(--ink-elev-2)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--ink-hair)",
                    cursor: "pointer",
                    color: active ? "var(--bone)" : "var(--bone-dim)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12.5,
                    transition: "background 0.12s",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.08em",
                      color: tone.fg,
                      background: tone.bg,
                      border: `1px solid ${tone.fg}`,
                      borderRadius: 3,
                      padding: "2px 5px",
                      minWidth: 48,
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    {ep.method}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={ep.path}
                  >
                    {ep.path.replace(/^\/api\/pay/, "")}
                  </span>
                  {ep.destructive && (
                    <AlertTriangle
                      size={11}
                      style={{
                        marginLeft: "auto",
                        color: "var(--vermilion, #b85b3a)",
                        flexShrink: 0,
                      }}
                      aria-label="Destructive endpoint"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ==================== RIGHT PANE ==================== */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {!selected ? (
          <div style={placeholderStyle}>Pick an endpoint from the left to begin.</div>
        ) : (
          <>
            {/* Endpoint header */}
            <div
              style={{
                border: "1px solid var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                padding: "14px 16px",
                background: "var(--ink-elev)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MethodBadge method={selected.method} />
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--bone)",
                    wordBreak: "break-all",
                  }}
                >
                  {selected.path}
                </code>
                {selected.destructive && (
                  <span
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--vermilion, #b85b3a)",
                      border: "1px solid var(--vermilion, #b85b3a)",
                      padding: "2px 7px",
                      borderRadius: 3,
                    }}
                  >
                    <AlertTriangle size={10} /> Destructive
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12.5,
                  color: "var(--bone-dim)",
                  lineHeight: 1.5,
                }}
              >
                {selected.description}
              </p>
            </div>

            {/* Path params */}
            {selected.pathParams && selected.pathParams.length > 0 && (
              <FieldGroup label="Path parameters">
                {selected.pathParams.map((name) => (
                  <FieldRow
                    key={name}
                    label={name}
                    placeholder={`:${name}`}
                    value={currentPath[name] ?? ""}
                    onChange={(v) =>
                      setPathValues((prev) => ({
                        ...prev,
                        [selected.id]: { ...(prev[selected.id] ?? {}), [name]: v },
                      }))
                    }
                  />
                ))}
              </FieldGroup>
            )}

            {/* Query params */}
            {selected.queryParams && selected.queryParams.length > 0 && (
              <FieldGroup label="Query parameters">
                {selected.queryParams.map((q) => (
                  <FieldRow
                    key={q.name}
                    label={q.name}
                    placeholder={q.description}
                    type={q.type === "number" ? "number" : "text"}
                    value={currentQuery[q.name] ?? ""}
                    onChange={(v) =>
                      setQueryValues((prev) => ({
                        ...prev,
                        [selected.id]: { ...(prev[selected.id] ?? {}), [q.name]: v },
                      }))
                    }
                  />
                ))}
              </FieldGroup>
            )}

            {/* Body */}
            {(selected.method === "POST" || selected.method === "PATCH") &&
              selected.bodySchema !== undefined && (
                <FieldGroup label="Request body (JSON)">
                  <textarea
                    value={currentBody}
                    spellCheck={false}
                    onChange={(e) =>
                      setBodyValues((prev) => ({
                        ...prev,
                        [selected.id]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      minHeight: 180,
                      padding: "12px 14px",
                      background: "var(--ink-deep)",
                      border: "1px solid var(--ink-hair)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--bone)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      resize: "vertical",
                      outline: "none",
                    }}
                  />
                </FieldGroup>
              )}

            {/* Resolved URL preview */}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--bone-quiet)",
                padding: "8px 12px",
                border: "1px dashed var(--ink-hair)",
                borderRadius: "var(--radius-sm)",
                wordBreak: "break-all",
              }}
            >
              <span style={{ color: "var(--bone-mute)" }}>Will request: </span>
              <span style={{ color: "var(--bone-dim)" }}>{composedUrl}</span>
            </div>

            {/* Destructive confirm */}
            {selected.destructive && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  border: "1px solid var(--vermilion, #b85b3a)",
                  background: "var(--ink-elev-1)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12.5,
                  color: "var(--bone-dim)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={currentConfirmed}
                  onChange={(e) =>
                    setConfirmedDestructive((prev) => ({
                      ...prev,
                      [selected.id]: e.target.checked,
                    }))
                  }
                />
                <span>
                  I understand this request is destructive and cannot be undone.
                </span>
              </label>
            )}

            {/* Action row */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn btn-primary btn-mini"
                onClick={execute}
                disabled={loading || (selected.destructive && !currentConfirmed)}
                title="Execute (Cmd/Ctrl+Enter)"
              >
                <PlayCircle size={12} /> {loading ? "Executing…" : "Execute"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-mini"
                onClick={copyCurl}
                title="Copy request as cURL"
              >
                <Copy size={12} /> Copy as cURL
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-mini"
                onClick={resetInputs}
                title="Reset inputs for this endpoint"
              >
                Reset
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--bone-quiet)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Sparkles size={11} /> Examples
                </span>
                {API_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => applyExample(ex.id)}
                    title={ex.description}
                    style={exampleChipStyle}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Response viewer */}
            <div
              aria-live="polite"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginTop: 4,
              }}
            >
              {errorState && (
                <div
                  role="alert"
                  style={{
                    padding: "12px 14px",
                    border: "1px solid var(--vermilion, #b85b3a)",
                    background: "var(--ink-elev-1)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--vermilion, #b85b3a)",
                    fontSize: 12.5,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {errorState.message}
                </div>
              )}
              {response && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      border: "1px solid var(--ink-hair)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--ink-elev)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: statusTone(response.status),
                        fontWeight: 600,
                      }}
                    >
                      {response.status} {response.statusText}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--bone-quiet)",
                      }}
                    >
                      · {response.durationMs} ms
                    </span>
                    {!response.bodyIsJson && response.rawBody.length > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--bone-quiet)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        non-json body
                      </span>
                    )}
                  </div>
                  <JsonPanel
                    json={response.bodyIsJson ? response.body : { raw: response.rawBody }}
                    label="Response body"
                    defaultOpen
                  />
                  <JsonPanel json={response.headers} label="Response headers" />
                </>
              )}
              {!response && !errorState && !loading && (
                <div
                  style={{
                    padding: "14px 16px",
                    border: "1px dashed var(--ink-hair)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--bone-quiet)",
                    fontSize: 12.5,
                    textAlign: "center",
                  }}
                >
                  No response yet. Press Execute (or Cmd/Ctrl+Enter).
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local helpers.
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: HttpMethod }) {
  const tone = METHOD_TONE[method];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.1em",
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.fg}`,
        padding: "3px 8px",
        borderRadius: 4,
      }}
    >
      {method}
    </span>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
        background: "var(--ink-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--bone-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "7px 10px",
          background: "var(--ink-deep)",
          border: "1px solid var(--ink-hair)",
          borderRadius: "var(--radius-sm)",
          color: "var(--bone)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          outline: "none",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles.
// ---------------------------------------------------------------------------

const placeholderStyle: CSSProperties = {
  padding: "32px 20px",
  border: "1px dashed var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone-quiet)",
  fontSize: 13,
  textAlign: "center",
};

const exampleChipStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid var(--ink-hair)",
  background: "var(--ink-elev-1)",
  color: "var(--bone-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  cursor: "pointer",
};
