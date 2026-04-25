"use client";

import React, { useMemo } from "react";

/**
 * One cohort row. `cohortMonth` is a `YYYY-MM` string. `retention[0]` is
 * always 1.0 (the cohort itself) and subsequent entries are the fraction
 * (0..1, 4-decimal precision) of the cohort that paid at least one invoice
 * in that later month.
 *
 * Each cell displays both the derived customer count and the percent:
 * `"45 (90%)"`, where count = round(retention * customerCount).
 */
export type CohortData = {
  cohortMonth: string;
  customerCount: number;
  /** 0..1 per month, index 0 = cohort month (=1.0). */
  retention: number[];
};

export interface CohortHeatmapProps {
  cohorts: CohortData[];
  isLoading?: boolean;
  /** Maximum number of M+N columns to render. Defaults to 12. */
  maxMonths?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "2026-03" -> "Mar 2026". Falls back to the raw string on parse failure. */
function formatCohortMonth(ym: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(ym);
  if (!m) return ym;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) return ym;
  const d = new Date(Date.UTC(year, monthIdx, 1));
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** 0..1 retention -> rgba cell background using DERO brand green. */
function cellBackground(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "transparent";
  const clamped = Math.min(1, Math.max(0, pct));
  // Keep a dim floor so a non-zero retention is always visible, and a
  // ceiling that stays readable against --ink.
  const alpha = 0.04 + clamped * 0.51;
  // var(--dero) = #5ec486 → rgb(94, 196, 134)
  return `rgba(94, 196, 134, ${alpha.toFixed(3)})`;
}

function cellTextColor(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "var(--bone-quiet)";
  return pct >= 0.35 ? "var(--bone)" : "var(--bone-dim)";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CohortHeatmap({
  cohorts,
  isLoading,
  maxMonths = 12,
}: CohortHeatmapProps) {
  const columnCount = useMemo(() => {
    if (!cohorts || cohorts.length === 0) return 0;
    let longest = 0;
    for (const c of cohorts) {
      if (c.retention && c.retention.length > longest) {
        longest = c.retention.length;
      }
    }
    return Math.min(longest, Math.max(1, maxMonths));
  }, [cohorts, maxMonths]);

  // ---- Loading state ------------------------------------------------------
  if (isLoading) {
    return (
      <div
        className="surface"
        style={{
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <SkeletonBar width="40%" height={12} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <SkeletonBar width={90} height={14} />
            <SkeletonBar width={60} height={14} />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
              <SkeletonBar key={j} width={52} height={22} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ---- Empty state --------------------------------------------------------
  if (!cohorts || cohorts.length === 0) {
    return (
      <div
        className="surface"
        role="status"
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--bone-dim)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--bone-quiet)",
            marginBottom: 8,
          }}
        >
          No cohort data
        </div>
        <div style={{ maxWidth: "48ch", margin: "0 auto" }}>
          Not enough invoice history yet — retention matrix needs at least 2
          months of paid invoices.
        </div>
      </div>
    );
  }

  // ---- Table --------------------------------------------------------------
  return (
    <div className="surface" style={{ padding: 0, overflowX: "auto" }}>
      <table
        role="table"
        aria-label="Customer retention cohorts"
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <th scope="col" style={headStyle("left")}>
              Cohort
            </th>
            <th scope="col" style={headStyle("right")}>
              # Customers
            </th>
            {Array.from({ length: columnCount }, (_, i) => (
              <th
                key={`m${i}`}
                scope="col"
                style={{ ...headStyle("center"), minWidth: 72 }}
              >
                M+{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => {
            const label = formatCohortMonth(c.cohortMonth);
            return (
              <tr key={c.cohortMonth}>
                <th
                  scope="row"
                  style={{
                    ...cellBaseStyle,
                    textAlign: "left",
                    color: "var(--bone)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    background: "var(--ink-elev-1)",
                  }}
                >
                  {label}
                </th>
                <td
                  style={{
                    ...cellBaseStyle,
                    textAlign: "right",
                    color: "var(--bone-dim)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                  }}
                >
                  {c.customerCount.toLocaleString("en-US")}
                </td>
                {Array.from({ length: columnCount }, (_, i) => {
                  const frac = c.retention[i];
                  const hasData = typeof frac === "number";
                  // Clamp & clean NaN/negatives that might creep in.
                  const pct = hasData
                    ? Math.max(0, Math.min(1, frac))
                    : 0;
                  const derivedCount = hasData
                    ? Math.round(pct * c.customerCount)
                    : 0;
                  const pctLabel = `${Math.round(pct * 100)}%`;
                  const bg = hasData ? cellBackground(pct) : "transparent";
                  const color = hasData
                    ? cellTextColor(pct)
                    : "var(--bone-quiet)";
                  const aria = hasData
                    ? `${label} month ${i}: ${derivedCount} customers, ${Math.round(
                        pct * 100
                      )} percent retained`
                    : `${label} month ${i}: no data`;
                  return (
                    <td
                      key={`${c.cohortMonth}-m${i}`}
                      aria-label={aria}
                      title={aria}
                      style={{
                        ...cellBaseStyle,
                        textAlign: "center",
                        background: bg,
                        color,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.02em",
                        transition: "background 0.18s var(--ease-out)",
                      }}
                    >
                      {hasData ? (
                        <span>
                          <span style={{ fontWeight: 500 }}>
                            {derivedCount}
                          </span>{" "}
                          <span
                            style={{
                              color: "var(--bone-quiet)",
                              fontSize: 10,
                            }}
                          >
                            ({pctLabel})
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--bone-quiet)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational primitives
// ---------------------------------------------------------------------------

function headStyle(align: "left" | "right" | "center"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "10px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--bone-quiet)",
    fontWeight: 500,
    borderBottom: "1px solid var(--ink-hair)",
    background: "var(--ink-elev-1)",
    whiteSpace: "nowrap",
  };
}

const cellBaseStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid var(--ink-hair)",
  verticalAlign: "middle",
};

function SkeletonBar({
  width,
  height = 12,
}: {
  width: number | string;
  height?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: 4,
        background: "var(--ink-elev-2)",
        opacity: 0.55,
      }}
    />
  );
}
