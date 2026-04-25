"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export type Group<T> = {
  key: string;
  label: string;
  items: T[];
  count: number;
};

type Props<T> = {
  items: T[];
  /** Returns a group key, or null/undefined to skip grouping. */
  groupBy: ((item: T) => string) | null;
  /** Map a raw key to a display label. Defaults to the key itself. */
  labelFor?: (key: string) => string;
  /**
   * Sort order for groups. "alpha" = alphabetical by key. "custom" = caller
   * supplies `groupOrder`. Default: alpha.
   */
  order?: "alpha" | "custom";
  groupOrder?: (a: Group<T>, b: Group<T>) => number;
  renderGroupHeader?: (g: Group<T>, collapsed: boolean) => React.ReactNode;
  renderRow: (item: T, idx: number) => React.ReactNode;
  /** Optional chrome around all the rows in a single group (e.g. a <table>). */
  renderGroupBody?: (
    g: Group<T>,
    rows: React.ReactNode,
  ) => React.ReactNode;
  defaultCollapsed?: boolean;
};

/**
 * Partition + render a list of items into collapsible groups.
 *
 * When `groupBy === null`, renders the flat list — each row is emitted via
 * `renderRow` at its original index. When `groupBy` is set, items are
 * bucketed and each bucket is rendered under a header. Indices passed to
 * `renderRow` are bucket-local (0-based within the group) so selection /
 * focus state can key off them if needed.
 *
 * Ordering: alphabetical by key unless `order="custom"` + `groupOrder` is
 * supplied. This is deterministic and matches how users expect "By status"
 * to look (alphabetised). For "By day" the caller can pass a custom order
 * that sorts by date desc.
 */
export function GroupedList<T>({
  items,
  groupBy,
  labelFor,
  order = "alpha",
  groupOrder,
  renderGroupHeader,
  renderRow,
  renderGroupBody,
  defaultCollapsed = false,
}: Props<T>) {
  const groups = useMemo<Group<T>[]>(() => {
    if (!groupBy) return [];
    const buckets = new Map<string, T[]>();
    for (const it of items) {
      const key = groupBy(it);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(it);
      else buckets.set(key, [it]);
    }
    const result: Group<T>[] = [];
    for (const [key, list] of buckets.entries()) {
      result.push({
        key,
        label: labelFor ? labelFor(key) : key,
        items: list,
        count: list.length,
      });
    }
    if (order === "custom" && groupOrder) {
      result.sort(groupOrder);
    } else {
      result.sort((a, b) => a.key.localeCompare(b.key));
    }
    return result;
  }, [items, groupBy, labelFor, order, groupOrder]);

  if (!groupBy) {
    return (
      <>
        {items.map((it, idx) => (
          <RowSlot key={idx}>{renderRow(it, idx)}</RowSlot>
        ))}
      </>
    );
  }

  return (
    <div role="list" style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((g) => (
        <GroupBlock
          key={g.key}
          group={g}
          defaultCollapsed={defaultCollapsed}
          renderGroupHeader={renderGroupHeader}
          renderRow={renderRow}
          renderGroupBody={renderGroupBody}
        />
      ))}
    </div>
  );
}

function GroupBlock<T>({
  group,
  defaultCollapsed,
  renderGroupHeader,
  renderRow,
  renderGroupBody,
}: {
  group: Group<T>;
  defaultCollapsed: boolean;
  renderGroupHeader?: (g: Group<T>, collapsed: boolean) => React.ReactNode;
  renderRow: (item: T, idx: number) => React.ReactNode;
  renderGroupBody?: (
    g: Group<T>,
    rows: React.ReactNode,
  ) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const header = renderGroupHeader ? (
    renderGroupHeader(group, collapsed)
  ) : (
    <DefaultGroupHeader label={group.label} count={group.count} collapsed={collapsed} />
  );

  const rowsNode = (
    <>
      {group.items.map((it, idx) => (
        <RowSlot key={idx}>{renderRow(it, idx)}</RowSlot>
      ))}
    </>
  );

  const body = renderGroupBody ? renderGroupBody(group, rowsNode) : rowsNode;

  return (
    <div role="group" aria-label={group.label}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={`group-body-${group.key}`}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        {header}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            id={`group-body-${group.key}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            {body}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Row slot — a plain fragment wrapper. We keep it as a component so the
 * `key` prop lives on a stable element (React warns about keys-on-fragments
 * if we inlined). Consumers just return their own element tree.
 */
function RowSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DefaultGroupHeader({
  label,
  count,
  collapsed,
}: {
  label: string;
  count: number;
  collapsed: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 18px 10px",
        borderTop: "1px solid var(--ink-hair)",
        background: "var(--ink)",
        position: "sticky",
        top: 0,
        zIndex: 2,
      }}
    >
      <span
        aria-hidden
        style={{ display: "inline-flex", color: "var(--bone-mute)" }}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </span>
      <span
        className="eyebrow-mono"
        style={{
          fontSize: 10.5,
          color: "var(--bone-dim)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          color: "var(--bone-quiet)",
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid var(--ink-hair)",
        }}
      >
        {count}
      </span>
    </div>
  );
}
