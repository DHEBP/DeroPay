/**
 * CSV / JSON export helpers for bulk-selected rows.
 *
 * Kept framework-free (plain DOM + Blob) so the same helpers can drive
 * `<BulkToolbar>` actions on any list page — invoices, escrow, customers,
 * webhooks — without pulling in a CSV library. See `components/bulk-toolbar.tsx`.
 *
 * Notes on CSV escaping:
 *   - Fields containing `,`, `"`, or a newline are double-quoted and inner
 *     quotes are doubled (RFC 4180 convention).
 *   - Objects / arrays are JSON-stringified inline; callers who want a
 *     flattened shape should pre-map the rows before passing them in.
 *   - Uses `\n` line endings; Excel, Numbers, and Google Sheets all accept
 *     this on import. Adding `\r\n` would be safer for strict Windows tooling
 *     but doubles the file size for common cases — revisit if users complain.
 */

export function exportJson(items: unknown[], filename: string): void {
  const blob = new Blob([JSON.stringify(items, null, 2)], {
    type: "application/json",
  });
  download(blob, filename);
}

export function exportCsv<T extends Record<string, unknown>>(
  items: T[],
  filename: string,
  headers?: ReadonlyArray<keyof T>,
): void {
  if (items.length === 0) return;
  const cols = (headers ?? (Object.keys(items[0]!) as (keyof T)[])) as (keyof T)[];
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [
    cols.map((c) => escape(String(c))).join(","),
    ...items.map((row) => cols.map((c) => escape(row[c])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  download(blob, filename);
}

function download(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return; // SSR guard
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Release the object URL on the next tick so the browser has time to
  // initiate the download before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
