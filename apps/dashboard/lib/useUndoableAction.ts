"use client";

/**
 * `useUndoableAction` — Gmail-style Undo primitive for destructive actions.
 *
 * The pattern in three acts:
 *
 *   1. `perform()`  — Soft-apply. Typically flips a server flag (archive,
 *                     deleted_at) AND mirrors the change in the UI (hide the
 *                     row, collapse the drawer). Runs before the toast appears
 *                     so the user sees the UI change and the "Undo" button
 *                     together. Returns an opaque handle that `revert`/`commit`
 *                     will receive later — typically an entity id, but callers
 *                     are free to stash a richer rollback payload.
 *
 *   2. Toast window — An info toast with an "Undo" action renders via the
 *                     existing `useToast()` system. If the user hits Undo
 *                     within `timeoutMs` (default 5000), `revert()` runs and
 *                     the toast dismisses. Otherwise the window expires and
 *                     step 3 fires.
 *
 *   3. `commit()`  — Runs after the timeout IF the user didn't Undo. For
 *                     "soft flag" actions like archive where `perform` already
 *                     persisted the change, `commit` is typically a no-op. For
 *                     genuinely two-phase actions (e.g. draft deletion with a
 *                     later purge), `perform` sets `deleted_at=now()`, `commit`
 *                     is a no-op (the nightly purge job reads the flag), and
 *                     `revert` clears the flag.
 *
 * Either side may fail. If `revert` throws an error, we emit a follow-up
 * error toast so the operator isn't left with a silent "my Undo didn't
 * work" mystery. Same for `commit`. `perform` errors propagate to the caller
 * so the caller can short-circuit UI updates before the toast even appears.
 *
 * Usage:
 *   const undoable = useUndoableAction<string>();
 *   const onArchive = () => undoable({
 *     perform: async () => {
 *       setHiddenIds((p) => new Set(p).add(id));
 *       await fetch(`/api/pay/invoices/${id}`, {
 *         method: "PATCH",
 *         headers: { "Content-Type": "application/json" },
 *         body: JSON.stringify({ archived: true }),
 *       });
 *       return id;
 *     },
 *     commit: async () => {
 *       // Archive is already persisted server-side; nothing to do here.
 *     },
 *     revert: async (id) => {
 *       await fetch(`/api/pay/invoices/${id}`, {
 *         method: "PATCH",
 *         headers: { "Content-Type": "application/json" },
 *         body: JSON.stringify({ archived: false }),
 *       });
 *       setHiddenIds((p) => { const n = new Set(p); n.delete(id); return n; });
 *     },
 *     message: "Invoice archived",
 *   });
 */

import { useCallback } from "react";
import { useToast } from "@/components/toast";

/**
 * Arguments accepted by `useUndoableAction()`'s returned function. `T` is the
 * opaque handle type returned by `perform` and passed to `revert`/`commit` —
 * typically an entity id or a rollback payload.
 */
export type UseUndoableActionArgs<T> = {
  /**
   * Soft-apply the action. Fires immediately. Should update both server state
   * (usually via a PATCH that sets a flag) and UI state (hide the row, close
   * the drawer, etc.) so the user sees the effect while the Undo is live.
   */
  perform: () => Promise<T>;
  /**
   * Invoked if the user does NOT hit Undo within the timeout window. For
   * flag-based actions where `perform` already persisted the change, this is
   * typically a no-op. For true two-phase deletes it can trigger a permanent
   * DELETE; more commonly the purge is handled by a background job reading
   * the flag, and this remains empty.
   */
  commit: (handle: T) => Promise<void>;
  /**
   * Invoked if the user hits Undo within the timeout. Should reverse both the
   * server flag AND the UI state change from `perform`.
   */
  revert: (handle: T) => Promise<void>;
  /** Primary line of the toast, e.g. "Invoice archived". */
  message: string;
  /** Secondary line under the title; use for context (invoice name, etc.). */
  description?: string;
  /** Custom label for the action button. Defaults to "Undo". */
  undoLabel?: string;
  /** Timeout (ms) before commit fires. Defaults to 5000. Clamped to [1000, 30000]. */
  timeoutMs?: number;
};

/**
 * Returns a function that runs an undoable action and surfaces the Undo toast.
 *
 * Call the returned function with `{ perform, commit, revert, message }` and
 * it returns a Promise that resolves when the soft-apply `perform()` resolves
 * (so the caller can `await` it if they want to block further UI work until
 * the server acks). The commit/revert leg runs asynchronously after the
 * timeout or user click — callers do NOT await those.
 */
export function useUndoableAction<T = unknown>() {
  const { toast } = useToast();

  return useCallback(
    async (args: UseUndoableActionArgs<T>): Promise<void> => {
      // Run the soft-apply first. If it throws, the caller sees the error and
      // no toast appears — typically the caller will show its own error toast.
      const handle = await args.perform();

      let reverted = false;
      let committed = false;

      const rawTimeout = args.timeoutMs ?? 5000;
      const timeoutMs = Math.max(1000, Math.min(30_000, rawTimeout));

      const runRevert = async () => {
        if (committed || reverted) return;
        reverted = true;
        try {
          await args.revert(handle);
          // Confirmation toast so the user knows the Undo went through.
          toast({
            title: "Undone",
            tone: "success",
            ttl: 2200,
          });
        } catch (err) {
          toast({
            title: "Undo failed",
            description: err instanceof Error ? err.message : String(err),
            tone: "error",
          });
        }
      };

      // Show the Undo toast. Its timeout matches our `timeoutMs` so the toast
      // disappears at the same moment the commit fires — no dead-button
      // window where the Undo visually exists but no longer works.
      toast({
        title: args.message,
        description: args.description,
        tone: "info",
        timeoutMs,
        action: {
          label: args.undoLabel ?? "Undo",
          onClick: () => {
            void runRevert();
          },
        },
      });

      // Schedule commit for after the toast window closes. If the user clicks
      // Undo first, `reverted` short-circuits the commit; if commit races with
      // an out-of-band click, the first one wins and the other becomes a
      // no-op (the flags are checked before any side-effect runs).
      setTimeout(() => {
        if (reverted || committed) return;
        committed = true;
        void (async () => {
          try {
            await args.commit(handle);
          } catch (err) {
            toast({
              title: "Commit failed",
              description: err instanceof Error ? err.message : String(err),
              tone: "error",
            });
          }
        })();
      }, timeoutMs);
    },
    [toast],
  );
}
