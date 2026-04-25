"use client";

import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  render: (row: Row, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  sortable?: boolean;
};

type Props<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  selectedRowKey?: string | null;
  caption?: string;
};

/**
 * DataTable — wraps the globally-styled `<table>` in a scrollable container
 * and consistently handles empty / selected / hover states. For fully custom
 * rows, compose `<Table>`+`<Thead>`+`<Tbody>`+`<Tr>`+`<Td>` directly.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  selectedRowKey,
  caption,
}: Props<Row>) {
  return (
    <div className="table-scroll">
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? "left",
                  width: col.width,
                }}
                scope="col"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: "center", color: "var(--bone-mute)", padding: "28px 16px" }}>
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const key = rowKey(row, i);
              const selected = key === selectedRowKey;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    cursor: onRowClick ? "pointer" : undefined,
                    background: selected ? "var(--dero-wash)" : undefined,
                  }}
                  aria-selected={selected || undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align ?? "left" }}>
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" {...props} />;
}
export function Td(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />;
}
