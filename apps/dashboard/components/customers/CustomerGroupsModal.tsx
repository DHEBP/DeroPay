"use client";

/**
 * Phase 2 #16 — Customer Groups management modal.
 *
 * Launched from the customers page toolbar. Lists every group, lets the
 * merchant create / rename / recolor / describe / delete groups. Membership
 * is assigned through a separate per-row popover (see
 * `AddToGroupPopover` below) invoked from the customers list — this modal
 * intentionally only owns the groups themselves, so the assign flow stays
 * lightweight and doesn't require an extra modal.
 *
 * Styling follows the rest of the dashboard: design tokens (`--dero`,
 * `--bone`, `--ink-elev-*`), `.btn`, `.surface`, framer-motion overlays.
 *
 * Collision avoidance: this file deliberately does NOT modify
 * CustomerDetailDrawer.tsx (Phase 2 #19 will add a kebab menu there).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/toast";
import type { CustomerGroup } from "@/lib/commerce-types";

// ---------------------------------------------------------------------------
// Color presets — referenced by name so the server stays opaque to the
// design-system token values. `customerColorFor()` maps a group row back
// to a concrete CSS value for rendering chips.
// ---------------------------------------------------------------------------

export type GroupColorToken =
  | "dero"
  | "amber"
  | "vermilion"
  | "cobalt"
  | "bone-dim";

const COLOR_PRESETS: Array<{ token: GroupColorToken; cssVar: string; label: string }> = [
  { token: "dero", cssVar: "var(--dero)", label: "Dero" },
  { token: "amber", cssVar: "var(--amber)", label: "Amber" },
  { token: "vermilion", cssVar: "var(--vermilion)", label: "Vermilion" },
  { token: "cobalt", cssVar: "var(--cobalt)", label: "Cobalt" },
  { token: "bone-dim", cssVar: "var(--bone-dim)", label: "Bone" },
];

/** Resolve a group's `color` value to a CSS color. Falls back to --dero. */
export function customerGroupColor(color?: string | null): string {
  if (!color) return "var(--dero)";
  const preset = COLOR_PRESETS.find((p) => p.token === color);
  if (preset) return preset.cssVar;
  // Custom hex / CSS color — pass through as-is.
  return color;
}

// ---------------------------------------------------------------------------
// Fetch helpers (mirrors the `apiFetch` in customers-page.tsx)
// ---------------------------------------------------------------------------

type ApiError = { error?: { code?: string; message?: string } | string; message?: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body: ApiError | null = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body && typeof body.error === "string" && body.error) ||
      (body && typeof body.error === "object" && body.error?.message) ||
      body?.message ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return (body ?? {}) as T;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Bubble up any mutation so the parent page can refresh downstream data. */
  onChange?: () => void;
};

type ListResponse = { groups: CustomerGroup[] };

export function CustomerGroupsModal({ open, onClose, onChange }: ModalProps) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<CustomerGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomerGroup | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ListResponse>(
        "/api/pay/customer-groups?withMembers=1"
      );
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on open
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // Escape to close (bubble-phase is fine; we don't have nested dialogs
  // unless edit/delete is open, in which case those dialogs stopPropagation).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing && !deleting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, editing, deleting, onClose]);

  const save = useCallback(
    async (
      target: CustomerGroup | "new",
      payload: { name: string; color: string | null; description: string | null }
    ) => {
      try {
        if (target === "new") {
          await apiFetch("/api/pay/customer-groups", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          toast({ title: "Group created", tone: "success" });
        } else {
          await apiFetch(
            `/api/pay/customer-groups/${encodeURIComponent(target.id)}`,
            { method: "PATCH", body: JSON.stringify(payload) }
          );
          toast({ title: "Group updated", tone: "success" });
        }
        setEditing(null);
        await reload();
        onChange?.();
      } catch (err) {
        toast({
          title: target === "new" ? "Create failed" : "Update failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [reload, onChange, toast]
  );

  const confirmDelete = useCallback(
    async (group: CustomerGroup) => {
      try {
        await apiFetch(
          `/api/pay/customer-groups/${encodeURIComponent(group.id)}`,
          { method: "DELETE" }
        );
        toast({ title: `Deleted "${group.name}"`, tone: "info" });
        setDeleting(null);
        await reload();
        onChange?.();
      } catch (err) {
        toast({
          title: "Delete failed",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      }
    },
    [reload, onChange, toast]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(2px)",
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Manage customer groups"
            className="surface"
            style={{
              width: "100%",
              maxWidth: 640,
              maxHeight: "85vh",
              overflow: "hidden",
              padding: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--ink-hair)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <Users size={15} strokeWidth={1.8} color="var(--bone-dim)" />
                <h3
                  className="display"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                    color: "var(--bone)",
                  }}
                >
                  Customer groups
                </h3>
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <button
                  className="btn btn-primary btn-mini"
                  onClick={() => setEditing("new")}
                  disabled={loading}
                >
                  <Plus size={12} /> New group
                </button>
                <button
                  className="btn btn-ghost btn-mini"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X size={12} />
                </button>
              </div>
            </header>

            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "16px 22px 22px",
              }}
            >
              {error && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    background: "var(--vermilion-wash)",
                    border: "1px solid rgba(224,93,68,0.28)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--bone)",
                    fontSize: 12.5,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{error}</span>
                  <button className="btn btn-ghost btn-mini" onClick={reload}>
                    Retry
                  </button>
                </div>
              )}

              {loading ? (
                <div
                  style={{
                    padding: "40px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    color: "var(--bone-quiet)",
                    fontSize: 12,
                  }}
                >
                  <Loader2 size={14} className="spin" /> Loading groups…
                </div>
              ) : groups.length === 0 ? (
                <div
                  style={{
                    padding: "40px 0",
                    textAlign: "center",
                    color: "var(--bone-quiet)",
                    fontSize: 13,
                  }}
                >
                  <Users
                    size={26}
                    strokeWidth={1.4}
                    color="var(--bone-quiet)"
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ color: "var(--bone-dim)", fontSize: 14, marginBottom: 4 }}>
                    No groups yet
                  </div>
                  <div style={{ maxWidth: "48ch", margin: "0 auto", lineHeight: 1.5 }}>
                    Create a group to segment customers — you&apos;ll be able to
                    target them in promotions, webhooks, and analytics.
                  </div>
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      onEdit={() => setEditing(g)}
                      onDelete={() => setDeleting(g)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {editing && (
        <GroupEditorDialog
          key={editing === "new" ? "new" : `edit-${editing.id}`}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => save(editing, payload)}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          key={`delete-${deleting.id}`}
          group={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Group row
// ---------------------------------------------------------------------------

function GroupRow({
  group,
  onEdit,
  onDelete,
}: {
  group: CustomerGroup;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "var(--ink-elev-1)",
        border: "1px solid var(--ink-hair)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: customerGroupColor(group.color),
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${customerGroupColor(group.color)}22`,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: "var(--bone)",
            fontSize: 13.5,
            fontWeight: 500,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {group.name}
        </div>
        {group.description ? (
          <div
            style={{
              color: "var(--bone-dim)",
              fontSize: 12,
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.description}
          </div>
        ) : (
          <div
            style={{
              color: "var(--bone-quiet)",
              fontSize: 11.5,
              fontStyle: "italic",
            }}
          >
            No description
          </div>
        )}
      </div>
      <span
        className="mono"
        style={{
          color: "var(--bone-quiet)",
          fontSize: 11,
          minWidth: 60,
          textAlign: "right",
        }}
      >
        {group.memberCount ?? 0} member{(group.memberCount ?? 0) === 1 ? "" : "s"}
      </span>
      <div style={{ display: "inline-flex", gap: 6 }}>
        <button
          className="btn btn-ghost btn-mini"
          onClick={onEdit}
          title="Edit group"
        >
          <Edit2 size={11} />
        </button>
        <button
          className="btn btn-ghost btn-mini"
          onClick={onDelete}
          title="Delete group"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Create/edit dialog
// ---------------------------------------------------------------------------

function GroupEditorDialog({
  initial,
  onClose,
  onSubmit,
}: {
  initial: CustomerGroup | null;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    color: string | null;
    description: string | null;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? "dero");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        color: color,
        description: description.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, color, description, onSubmit]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 960,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{ width: "100%", maxWidth: 460, padding: 0, overflow: "hidden" }}
      >
        <header
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--ink-hair)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h4
            className="display"
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: 0,
              color: "var(--bone)",
            }}
          >
            {initial ? "Edit group" : "New group"}
          </h4>
          <button
            className="btn btn-ghost btn-mini"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </header>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <div style={labelStyle}>Name</div>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) submit();
              }}
              placeholder="VIP, Enterprise, Beta testers…"
              style={inputStyle}
              maxLength={64}
            />
          </label>

          <div>
            <div style={labelStyle}>Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map((p) => {
                const active = color === p.token;
                return (
                  <button
                    key={p.token}
                    type="button"
                    onClick={() => setColor(p.token)}
                    aria-label={p.label}
                    title={p.label}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1.5px solid ${active ? "var(--bone)" : "var(--ink-hair)"}`,
                      background: p.cssVar,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      transition: "border-color 0.12s var(--ease-out)",
                    }}
                  >
                    {active && <Check size={14} color="var(--ink-deep)" />}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "block" }}>
            <div style={labelStyle}>Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal note, visible only to merchant staff."
              rows={3}
              style={{ ...inputStyle, fontFamily: "var(--font-sans)", resize: "vertical" }}
              maxLength={240}
            />
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button className="btn btn-ghost btn-mini" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-mini"
              onClick={submit}
              disabled={submitting || !name.trim()}
            >
              {submitting ? "Saving…" : initial ? "Save changes" : "Create group"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Confirm delete dialog
// ---------------------------------------------------------------------------

function ConfirmDeleteDialog({
  group,
  onCancel,
  onConfirm,
}: {
  group: CustomerGroup;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const run = useCallback(async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }, [onConfirm]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 960,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="surface"
        style={{ width: "100%", maxWidth: 420, padding: 22 }}
      >
        <h4
          className="display"
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: "0 0 6px",
            color: "var(--vermilion)",
          }}
        >
          Delete group “{group.name}”?
        </h4>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--bone-dim)",
            lineHeight: 1.55,
            margin: "0 0 16px",
          }}
        >
          Members will be removed from this group but their customer profiles
          and invoice history are unaffected. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-mini" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-mini"
            onClick={run}
            disabled={submitting}
            style={{
              background: "var(--vermilion)",
              borderColor: "var(--vermilion)",
            }}
          >
            {submitting ? "Deleting…" : "Delete group"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// "Add to group…" popover used from the customer list kebab
// ---------------------------------------------------------------------------

export function AddToGroupPopover({
  customerId,
  anchorRect,
  onClose,
  onApplied,
}: {
  customerId: string;
  /** DOMRect of the trigger so we can position the popover under it. */
  anchorRect: DOMRect | null;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [all, mine] = await Promise.all([
          apiFetch<ListResponse>("/api/pay/customer-groups"),
          apiFetch<ListResponse>(
            `/api/pay/customers/${encodeURIComponent(customerId)}/groups`
          ),
        ]);
        if (cancelled) return;
        setGroups(all.groups ?? []);
        const mineIds = new Set((mine.groups ?? []).map((g) => g.id));
        setSelected(mineIds);
        setInitial(new Set(mineIds));
      } catch (err) {
        if (cancelled) return;
        toast({
          title: "Failed to load groups",
          description: err instanceof Error ? err.message : undefined,
          tone: "error",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, toast]);

  // Close on outside click / Escape
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer by one tick so the click that opened the popover doesn't
    // immediately close it.
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDocClick);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const apply = useCallback(async () => {
    const toAdd = [...selected].filter((id) => !initial.has(id));
    const toRemove = [...initial].filter((id) => !selected.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all([
        ...toAdd.map((groupId) =>
          apiFetch(
            `/api/pay/customer-groups/${encodeURIComponent(groupId)}/members`,
            {
              method: "POST",
              body: JSON.stringify({ customerIds: [customerId] }),
            }
          )
        ),
        ...toRemove.map((groupId) =>
          apiFetch(
            `/api/pay/customer-groups/${encodeURIComponent(groupId)}/members`,
            {
              method: "DELETE",
              body: JSON.stringify({ customerIds: [customerId] }),
            }
          )
        ),
      ]);
      toast({ title: "Groups updated", tone: "success" });
      onApplied?.();
      onClose();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [customerId, selected, initial, onApplied, onClose, toast]);

  // Position: below the anchor, right-aligned. Fallback to viewport center
  // when no rect is supplied.
  const style = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 950,
      width: 260,
      maxHeight: 340,
      overflow: "auto",
      padding: 12,
      background: "var(--ink-elev-2)",
      border: "1px solid var(--ink-hair)",
      borderRadius: "var(--radius-sm)",
      boxShadow: "0 20px 40px -20px rgba(0,0,0,0.65)",
    };
    if (!anchorRect) {
      return { ...base, top: "40vh", left: "50%", transform: "translateX(-50%)" };
    }
    // Default: anchor below & right-aligned to trigger.
    const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 360);
    const right = Math.max(8, window.innerWidth - anchorRect.right);
    return { ...base, top, right };
  }, [anchorRect]);

  return (
    <motion.div
      ref={popRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      style={style}
      role="dialog"
      aria-label="Add customer to groups"
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--bone-quiet)",
          marginBottom: 8,
        }}
      >
        Add to groups
      </div>

      {loading ? (
        <div
          style={{
            padding: "14px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "var(--bone-quiet)",
            fontSize: 12,
          }}
        >
          <Loader2 size={12} className="spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div
          style={{
            padding: "10px 0",
            color: "var(--bone-quiet)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          No groups defined yet. Create one from the customers toolbar.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {groups.map((g) => {
            const checked = selected.has(g.id);
            return (
              <li key={g.id}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLLabelElement).style.background =
                      "var(--ink-elev-1)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLLabelElement).style.background =
                      "transparent")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(g.id)}
                    style={{ accentColor: "var(--dero)" }}
                  />
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: customerGroupColor(g.color),
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: "var(--bone)",
                      fontSize: 12.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {g.name}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--ink-hair)",
          display: "flex",
          gap: 6,
          justifyContent: "flex-end",
        }}
      >
        <button className="btn btn-ghost btn-mini" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-mini"
          onClick={apply}
          disabled={submitting || loading || groups.length === 0}
        >
          {submitting ? "Saving…" : "Apply"}
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Wave 2B bulk-action stub — see report for the contract.
// ---------------------------------------------------------------------------

/**
 * Wave 2B `BulkToolbar` plug-in stub. When Wave 2B lands its pluggable
 * actions API, it should register an action with `key: "add-to-group"`
 * that pops a modal letting the user pick a single destination group,
 * then fire:
 *
 *   POST /api/pay/customer-groups/<groupId>/members
 *   { customerIds: [...selectedRows] }
 *
 * Returns `{ added: number }`. 404 when the group doesn't exist; 400 on an
 * empty/invalid customerIds array.
 */
export const BULK_ADD_TO_GROUP_ACTION = {
  id: "add-to-group",
  label: "Add to group…",
  /** Endpoint the bulk toolbar should POST to once the user has picked a groupId. */
  endpoint: (groupId: string) =>
    `/api/pay/customer-groups/${encodeURIComponent(groupId)}/members`,
  body: (customerIds: string[]) => ({ customerIds }),
} as const;

// ---------------------------------------------------------------------------
// Shared style primitives
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--bone-quiet)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--ink-deep)",
  border: "1px solid var(--ink-hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--bone)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};
