"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSavedViews } from "@/lib/useSavedViews";
import { facetsEqual, type SavedView } from "@/lib/saved-views";
import { Button, Dialog, Input, KebabButton, Menu } from "@/components/ui";
import type { MenuAction } from "@/components/ui";

type Props = {
  pageKey: string;
  /** Filter param keys the page wants bundled into facets (e.g. ["status","q"]). */
  filterKeys: ReadonlyArray<string>;
};

/**
 * SavedViewBar — horizontal pill row. Pinned views render as always-visible
 * pills; non-pinned user views live behind a "More" menu. A gear menu on
 * the right exposes rename/delete/save-changes for the active view. The
 * trailing "+ New view" pill saves the current URL facets as a new view.
 *
 * Renders NOTHING on the server — all state is client-local (searchParams +
 * localStorage). The hook returns SSR-safe defaults so first paint is fine.
 */
export function SavedViewBar({ pageKey, filterKeys }: Props) {
  const {
    views,
    activeView,
    currentFacets,
    applyView,
    createView,
    deleteView,
    renameView,
  } = useSavedViews(pageKey, filterKeys);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedView | null>(null);

  // Partition pinned vs overflow. Built-ins are always pinned.
  const pinned = useMemo(
    () => views.filter((v) => v.builtin || v.pinned),
    [views],
  );
  const overflow = useMemo(
    () => views.filter((v) => !v.builtin && !v.pinned),
    [views],
  );

  // Dirty = current URL facets don't match the active view's facets. When no
  // view is active (e.g. ad-hoc filter combo), we don't show a dot because
  // there's no reference view to be "dirty" against.
  const dirty =
    activeView !== null && !facetsEqual(activeView.facets, currentFacets);

  const overflowActions: MenuAction[] = overflow.map((v) => ({
    id: v.id,
    label: v.name,
    onClick: () => applyView(v),
  }));

  const gearActions: MenuAction[] = [];
  if (dirty && activeView) {
    gearActions.push({
      id: "save-changes",
      label: `Save changes to "${activeView.name}"`,
      onClick: () => {
        if (activeView.builtin) {
          // Built-ins can't be edited — offer a "save as new" instead.
          setCreateOpen(true);
        } else {
          // Overwrite the view: delete + create keeps localStorage atomic-ish.
          // Simpler: rename isn't the op — we want facet replacement. Do it
          // inline by re-creating with same name (and different id). We keep
          // the old one only if it's been applied elsewhere? No — replace.
          // Use deleteView then createView for a clean swap.
          deleteView(activeView.id);
          createView(activeView.name, currentFacets);
        }
      },
    });
  }
  gearActions.push({
    id: "save-as-new",
    label: "Save as new view…",
    onClick: () => setCreateOpen(true),
  });
  if (activeView && !activeView.builtin) {
    gearActions.push({
      id: "rename",
      label: `Rename "${activeView.name}"…`,
      onClick: () => setRenameTarget(activeView),
    });
    gearActions.push({
      id: "delete",
      label: `Delete "${activeView.name}"`,
      destructive: true,
      onClick: () => setDeleteTarget(activeView),
    });
  }

  return (
    <div
      role="toolbar"
      aria-label="Saved views"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      {pinned.map((v) => {
        const isActive = activeView?.id === v.id;
        return (
          <ViewPill
            key={v.id}
            label={v.name}
            active={isActive}
            dirty={isActive && dirty}
            onClick={() => applyView(v)}
          />
        );
      })}

      {overflow.length > 0 && (
        <Menu
          trigger={
            <button
              type="button"
              className="mono"
              aria-label="More saved views"
              style={pillButtonStyle(false)}
            >
              More
              <ChevronDown size={11} aria-hidden style={{ marginLeft: 4 }} />
            </button>
          }
          actions={overflowActions}
          ariaLabel="More saved views"
        />
      )}

      <ViewPill
        label="+ New view"
        active={false}
        onClick={() => setCreateOpen(true)}
        dashed
      />

      <div style={{ flex: 1 }} />

      <Menu
        trigger={<KebabButton ariaLabel="View options" />}
        actions={gearActions}
        ariaLabel="View options"
      />

      <CreateViewDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultName={activeView ? `${activeView.name} copy` : ""}
        onCreate={(name) => {
          createView(name, currentFacets);
          setCreateOpen(false);
        }}
      />

      <RenameViewDialog
        view={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={(name) => {
          if (renameTarget) renameView(renameTarget.id, name);
          setRenameTarget(null);
        }}
      />

      <DeleteViewDialog
        view={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteView(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function pillButtonStyle(active: boolean, dashed = false): React.CSSProperties {
  return {
    padding: "5px 11px",
    borderRadius: 999,
    border: `1px ${dashed ? "dashed" : "solid"} ${active ? "var(--dero)" : "var(--ink-hair)"}`,
    background: active ? "var(--dero-wash)" : "transparent",
    color: active ? "var(--dero)" : "var(--bone-dim)",
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.15s var(--ease-out)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function ViewPill({
  label,
  active,
  dirty = false,
  onClick,
  dashed = false,
}: {
  label: string;
  active: boolean;
  dirty?: boolean;
  onClick: () => void;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={pillButtonStyle(active, dashed)}
    >
      <span>{label}</span>
      {dirty && (
        <span
          aria-label="unsaved changes"
          title="This view has unsaved changes"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--dero)",
            marginLeft: 2,
          }}
        />
      )}
    </button>
  );
}

function CreateViewDialog({
  open,
  onClose,
  defaultName,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the name whenever the dialog opens so stale values from a
  // previous cancel don't leak in.
  useMemoOnOpen(open, () => {
    setName(defaultName);
    // Focus after a paint so the Dialog's own focus trap doesn't override.
    queueMicrotask(() => inputRef.current?.select());
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save current view"
      description="Capture your filters, sort, and grouping as a named pill for one-click reuse."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save view
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          htmlFor="saved-view-name"
          className="eyebrow-mono"
          style={{ fontSize: 10, color: "var(--bone-mute)" }}
        >
          Name
        </label>
        <Input
          id="saved-view-name"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Today pending"
          autoFocus
        />
      </div>
    </Dialog>
  );
}

function RenameViewDialog({
  view,
  onClose,
  onRename,
}: {
  view: SavedView | null;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const open = !!view;

  useMemoOnOpen(open, () => {
    setName(view?.name ?? "");
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onRename(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename view"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus
      />
    </Dialog>
  );
}

function DeleteViewDialog({
  view,
  onClose,
  onConfirm,
}: {
  view: SavedView | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = !!view;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      destructive
      title={`Delete "${view?.name ?? ""}"?`}
      description="This removes the pill from your view bar. Your invoices are not affected."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete view
          </Button>
        </>
      }
    />
  );
}

/**
 * Fire `fn` once each time `open` transitions false→true. Avoids the common
 * "reset form state on open" footgun where a useEffect with `[open]` fires
 * on mount too, pre-populating empty state.
 */
function useMemoOnOpen(open: boolean, fn: () => void) {
  const prev = useRef(false);
  if (open && !prev.current) {
    prev.current = true;
    fn();
  } else if (!open && prev.current) {
    prev.current = false;
  }
}

