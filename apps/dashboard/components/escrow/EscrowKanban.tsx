"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, MoreHorizontal, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatDero, truncate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical lane for the 4-column board. The real escrow state machine is
 * richer than this (see `packages/dero-pay/src/escrow/manager.ts`), so we
 * collapse related states into a lane:
 *
 *  - proposed:  deploying | awaiting_deposit | deploy_failed
 *  - funded:    funded
 *  - disputed:  disputed
 *  - released:  released | refunded | expired_claimed | arbitrated
 */
export type EscrowLane = "proposed" | "funded" | "released" | "disputed";

export type EscrowCard = {
  /** Local invoice id — feeds the drawer and all API calls. */
  id: string;
  /** On-chain SCID when deployed. */
  scid?: string;
  /** Atomic-unit amount (string), formatted at render time. */
  amount: string;
  /** Display label for the counterparty (seller address, truncated). */
  counterparty: string;
  /** Lane this card currently lives in. */
  state: EscrowLane;
  /** Raw escrowStatus from the server — used to pick the exact action. */
  rawStatus: string;
  /** Age in ms since creation. */
  age: number;
};

type Props = {
  escrows: EscrowCard[];
  onCardClick: (id: string) => void;
  /**
   * Fires after a valid drop (optimistic move + server call). `action` is
   * the server-side verb (confirmDelivery / dispute / arbitrateRelease).
   * The caller performs the fetch and either resolves or rejects. Rejection
   * reverts the optimistic move and surfaces a toast.
   */
  onStateChange: (
    id: string,
    from: EscrowLane,
    to: EscrowLane,
    action: EscrowAction,
  ) => Promise<void>;
  loading?: boolean;
};

// ---------------------------------------------------------------------------
// State machine — drag transitions only (subset of full machine)
// ---------------------------------------------------------------------------

export type EscrowAction =
  | "confirmDelivery"
  | "refundBuyer"
  | "dispute"
  | "claimAfterExpiry"
  | "arbitrateRelease"
  | "arbitrateRefund";

type Transition = {
  action: EscrowAction;
  label: string;
  /** When true, the drop opens a confirmation dialog before firing. */
  confirm: boolean;
  /** Short sentence shown in the confirm dialog. */
  confirmCopy?: string;
};

/**
 * Lane-level transitions — keyed by current lane, then target lane.
 *
 * Rules checked against manager.ts:
 *  - proposed → funded is an on-chain buyer deposit and cannot be driven
 *    from this UI (no wallet signer here). Blocked with a toast.
 *  - funded → released is `confirmDelivery` (immediate).
 *  - funded → disputed is `dispute` (immediate).
 *  - disputed → released is `arbitrateRelease` — requires arbitrator
 *    signoff, so we open a confirm dialog first.
 *  - released is terminal.
 */
const DRAG_TRANSITIONS: Partial<
  Record<EscrowLane, Partial<Record<EscrowLane, Transition>>>
> = {
  funded: {
    released: {
      action: "confirmDelivery",
      label: "Release to seller",
      confirm: false,
    },
    disputed: {
      action: "dispute",
      label: "Raise dispute",
      confirm: false,
    },
  },
  disputed: {
    released: {
      action: "arbitrateRelease",
      label: "Arbitrate · release to seller",
      confirm: true,
      confirmCopy:
        "This releases escrowed funds to the seller. Arbitration is irreversible.",
    },
  },
};

function transitionFor(
  from: EscrowLane,
  to: EscrowLane,
): Transition | null {
  if (from === to) return null;
  return DRAG_TRANSITIONS[from]?.[to] ?? null;
}

function availableTargets(from: EscrowLane): Array<{
  to: EscrowLane;
  transition: Transition;
}> {
  const row = DRAG_TRANSITIONS[from];
  if (!row) return [];
  return Object.entries(row).map(([to, transition]) => ({
    to: to as EscrowLane,
    transition: transition as Transition,
  }));
}

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------

const COLUMNS: Array<{
  lane: EscrowLane;
  label: string;
  accent: string; // CSS var for border glow when drag-hovered
  helpText: string;
}> = [
  {
    lane: "proposed",
    label: "Proposed",
    accent: "var(--ink-hair)",
    helpText: "Deployed · awaiting deposit",
  },
  {
    lane: "funded",
    label: "Funded",
    accent: "var(--amber, #e8b14a)",
    helpText: "Buyer paid · awaiting release",
  },
  {
    lane: "disputed",
    label: "Disputed",
    accent: "var(--vermilion)",
    helpText: "Arbitration pending",
  },
  {
    lane: "released",
    label: "Released",
    accent: "var(--dero)",
    helpText: "Settled on-chain",
  },
];

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

type DragState = {
  id: string;
  from: EscrowLane;
} | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgoMs(age: number): string {
  const s = Math.max(0, Math.floor(age / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function laneToneBadge(
  lane: EscrowLane,
  rawStatus: string,
): {
  tone: "positive" | "warn" | "info" | "danger" | "neutral";
  pulse: boolean;
} {
  if (lane === "released") {
    if (rawStatus === "refunded") return { tone: "neutral", pulse: false };
    return { tone: "positive", pulse: false };
  }
  if (lane === "disputed") return { tone: "warn", pulse: false };
  if (lane === "funded") return { tone: "warn", pulse: true };
  if (rawStatus === "deploy_failed") return { tone: "danger", pulse: false };
  return { tone: "info", pulse: true };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EscrowKanban({
  escrows,
  onCardClick,
  onStateChange,
  loading = false,
}: Props) {
  const [drag, setDrag] = useState<DragState>(null);
  const [hoverLane, setHoverLane] = useState<EscrowLane | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    id: string;
    from: EscrowLane;
    to: EscrowLane;
    transition: Transition;
  } | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<Record<string, EscrowLane>>(
    {},
  );
  const [errorFlash, setErrorFlash] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  // Drop any optimistic overrides once the underlying row catches up. This
  // avoids a brief "wrong lane" flicker after the server confirms.
  useEffect(() => {
    if (Object.keys(optimisticMove).length === 0) return;
    setOptimisticMove((prev) => {
      let changed = false;
      const next: Record<string, EscrowLane> = {};
      for (const [id, lane] of Object.entries(prev)) {
        const actual = escrows.find((e) => e.id === id);
        if (!actual) {
          // card dropped from dataset entirely; keep until it's back
          next[id] = lane;
          continue;
        }
        if (actual.state === lane) {
          changed = true;
          continue;
        }
        next[id] = lane;
      }
      return changed ? next : prev;
    });
  }, [escrows, optimisticMove]);

  const effectiveLane = useCallback(
    (c: EscrowCard): EscrowLane => optimisticMove[c.id] ?? c.state,
    [optimisticMove],
  );

  const grouped = useMemo(() => {
    const by: Record<EscrowLane, EscrowCard[]> = {
      proposed: [],
      funded: [],
      released: [],
      disputed: [],
    };
    for (const c of escrows) {
      by[effectiveLane(c)].push(c);
    }
    return by;
  }, [escrows, effectiveLane]);

  const cardById = useMemo(() => {
    const map = new Map<string, EscrowCard>();
    for (const c of escrows) map.set(c.id, c);
    return map;
  }, [escrows]);

  // ---- drag handlers -------------------------------------------------------

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, card: EscrowCard) => {
      const lane = effectiveLane(card);
      setDrag({ id: card.id, from: lane });
      try {
        e.dataTransfer.setData("text/escrow-id", card.id);
        e.dataTransfer.setData("text/escrow-from", lane);
        e.dataTransfer.effectAllowed = "move";
      } catch {
        // Some environments (jsdom) don't implement setData — ignore.
      }
    },
    [effectiveLane],
  );

  const handleDragEnd = useCallback(() => {
    setDrag(null);
    setHoverLane(null);
  }, []);

  const performTransition = useCallback(
    async (
      id: string,
      from: EscrowLane,
      to: EscrowLane,
      transition: Transition,
    ) => {
      setOptimisticMove((prev) => ({ ...prev, [id]: to }));
      try {
        await onStateChange(id, from, to, transition.action);
      } catch (err) {
        // revert
        setOptimisticMove((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const msg =
          err instanceof Error ? err.message : "Transition failed";
        setErrorFlash(msg);
      }
    },
    [onStateChange],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetLane: EscrowLane) => {
      e.preventDefault();
      setHoverLane(null);
      setDrag(null);

      let id = "";
      let from: EscrowLane | "" = "";
      try {
        id = e.dataTransfer.getData("text/escrow-id");
        from = (e.dataTransfer.getData(
          "text/escrow-from",
        ) as EscrowLane) || "";
      } catch {
        /* fall through to drag-state fallback */
      }
      if (!id && drag) {
        id = drag.id;
        from = drag.from;
      }
      if (!id || !from) return;

      const transition = transitionFor(from, targetLane);
      if (!transition) {
        setErrorFlash(
          `Can't move from ${from} to ${targetLane} — not a valid transition.`,
        );
        return;
      }

      if (transition.confirm) {
        setPendingTransition({ id, from, to: targetLane, transition });
        return;
      }
      void performTransition(id, from, targetLane, transition);
    },
    [drag, performTransition],
  );

  const handleColumnDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, lane: EscrowLane) => {
      if (!drag) return;
      const valid = transitionFor(drag.from, lane);
      if (!valid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (hoverLane !== lane) setHoverLane(lane);
    },
    [drag, hoverLane],
  );

  const handleColumnDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>, lane: EscrowLane) => {
      // relatedTarget is null when leaving the window entirely
      const related = e.relatedTarget as Node | null;
      if (!e.currentTarget.contains(related)) {
        setHoverLane((prev) => (prev === lane ? null : prev));
      }
    },
    [],
  );

  // Auto-dismiss error flash
  useEffect(() => {
    if (!errorFlash) return;
    const t = setTimeout(() => setErrorFlash(null), 3500);
    return () => clearTimeout(t);
  }, [errorFlash]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenFor) return;
    const onDocClick = () => setMenuOpenFor(null);
    // Defer to next tick so the click that opened the menu doesn't close it
    const t = setTimeout(() => {
      document.addEventListener("click", onDocClick, { once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick);
    };
  }, [menuOpenFor]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ padding: 18, position: "relative" }}>
      <AnimatePresence>
        {errorFlash && (
          <motion.div
            key={errorFlash}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              top: 10,
              left: 18,
              right: 18,
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              background: "var(--vermilion-wash)",
              border: "1px solid rgba(224, 93, 68, 0.3)",
              color: "var(--vermilion)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              zIndex: 5,
            }}
          >
            {errorFlash}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {COLUMNS.map((col) => {
          const cards = grouped[col.lane];
          const isDropTarget =
            !!drag && !!transitionFor(drag.from, col.lane);
          const isActive = hoverLane === col.lane && isDropTarget;

          return (
            <div
              key={col.lane}
              data-lane={col.lane}
              onDragOver={(e) => handleColumnDragOver(e, col.lane)}
              onDragLeave={(e) => handleColumnDragLeave(e, col.lane)}
              onDrop={(e) => handleDrop(e, col.lane)}
              style={{
                borderRadius: "var(--radius)",
                background: "var(--ink-elev)",
                border: `1px solid ${
                  isActive ? col.accent : "var(--ink-hair)"
                }`,
                outline: isActive
                  ? `1px dashed ${col.accent}`
                  : undefined,
                outlineOffset: isActive ? 2 : 0,
                boxShadow: isActive
                  ? `0 0 0 6px color-mix(in oklab, ${col.accent} 10%, transparent)`
                  : undefined,
                padding: "12px 12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 400,
                transition:
                  "border-color 140ms ease, box-shadow 140ms ease",
              }}
            >
              <ColumnHeader
                label={col.label}
                helpText={col.helpText}
                count={cards.length}
                accent={col.accent}
                dropReady={isDropTarget && !isActive}
              />

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  overflowY: "auto",
                  maxHeight: 520,
                  paddingRight: 2,
                  minHeight: 120,
                }}
              >
                {loading && cards.length === 0 ? (
                  <SkeletonStack count={3} />
                ) : cards.length === 0 ? (
                  <EmptyColumn />
                ) : (
                  cards.map((card) => (
                    <EscrowCardView
                      key={card.id}
                      card={card}
                      lane={effectiveLane(card)}
                      isDragging={drag?.id === card.id}
                      menuOpen={menuOpenFor === card.id}
                      onToggleMenu={(open) =>
                        setMenuOpenFor(open ? card.id : null)
                      }
                      onClick={() => onCardClick(card.id)}
                      onDragStart={(e) => handleDragStart(e, card)}
                      onDragEnd={handleDragEnd}
                      onMoveTo={(to, transition) => {
                        setMenuOpenFor(null);
                        if (transition.confirm) {
                          setPendingTransition({
                            id: card.id,
                            from: effectiveLane(card),
                            to,
                            transition,
                          });
                        } else {
                          void performTransition(
                            card.id,
                            effectiveLane(card),
                            to,
                            transition,
                          );
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm dialog for arbitration-style transitions. Lightweight local
          dialog so we don't drag the full <Dialog> focus-management in for a
          single action — but same visual grammar. */}
      <AnimatePresence>
        {pendingTransition && (
          <ConfirmTransition
            card={cardById.get(pendingTransition.id) ?? null}
            from={pendingTransition.from}
            to={pendingTransition.to}
            transition={pendingTransition.transition}
            onCancel={() => setPendingTransition(null)}
            onConfirm={async () => {
              const pt = pendingTransition;
              setPendingTransition(null);
              await performTransition(pt.id, pt.from, pt.to, pt.transition);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

function ColumnHeader({
  label,
  helpText,
  count,
  accent,
  dropReady,
}: {
  label: string;
  helpText: string;
  count: number;
  accent: string;
  dropReady: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingBottom: 8,
        borderBottom: "1px solid var(--ink-hair)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 2,
          background: accent,
          opacity: dropReady ? 1 : 0.6,
          transition: "opacity 140ms ease",
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="eyebrow"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.18em",
            color: "var(--bone)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--bone-mute)",
            marginTop: 2,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.03em",
          }}
        >
          {helpText}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--bone-dim)",
          padding: "2px 8px",
          borderRadius: 4,
          background: "var(--ink)",
          border: "1px solid var(--ink-hair)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function EscrowCardView({
  card,
  lane,
  isDragging,
  menuOpen,
  onToggleMenu,
  onClick,
  onDragStart,
  onDragEnd,
  onMoveTo,
}: {
  card: EscrowCard;
  lane: EscrowLane;
  isDragging: boolean;
  menuOpen: boolean;
  onToggleMenu: (open: boolean) => void;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMoveTo: (to: EscrowLane, transition: Transition) => void;
}) {
  const [hover, setHover] = useState(false);
  const { tone, pulse } = laneToneBadge(lane, card.rawStatus);
  const targets = availableTargets(lane);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      } else if (e.key === "m" || e.key === "M") {
        if (targets.length > 0) {
          e.preventDefault();
          onToggleMenu(!menuOpen);
        }
      } else if (e.key === "Escape" && menuOpen) {
        e.preventDefault();
        onToggleMenu(false);
      }
    },
    [onClick, onToggleMenu, menuOpen, targets.length],
  );

  const cardStyle: CSSProperties = {
    position: "relative",
    padding: "10px 12px 11px",
    borderRadius: "var(--radius)",
    background: hover ? "var(--ink-elev-2)" : "var(--ink)",
    border: `1px solid ${hover ? "var(--dero-hair)" : "var(--ink-hair)"}`,
    cursor: "grab",
    boxShadow: hover
      ? "0 4px 18px -10px rgba(0,0,0,0.5)"
      : "none",
    opacity: isDragging ? 0.4 : 1,
    transform: hover ? "translateY(-1px)" : undefined,
    transition:
      "background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        role="button"
        tabIndex={0}
        draggable={true}
        aria-grabbed={isDragging}
        aria-label={`Escrow ${card.id} · ${lane} · ${card.amount} atomic units`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        onKeyDown={handleKey}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={cardStyle}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <code
            className="mono"
            style={{
              fontSize: 10.5,
              color: "var(--bone-dim)",
              letterSpacing: "0.04em",
            }}
          >
            {truncate(card.id, 5, 4)}
          </code>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--bone)",
              fontVariantNumeric: "tabular-nums slashed-zero",
              textAlign: "right",
            }}
          >
            {formatDero(card.amount, 5)}
            <span
              style={{
                marginLeft: 4,
                fontSize: 9,
                color: "var(--bone-quiet)",
                letterSpacing: "0.14em",
              }}
            >
              DERO
            </span>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--bone-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={card.counterparty}
        >
          {card.counterparty || "—"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 2,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--bone-mute)",
              letterSpacing: "0.04em",
            }}
          >
            {timeAgoMs(card.age)} ago
          </span>
          <Badge tone={tone} pulse={pulse}>
            {card.rawStatus.replace(/_/g, " ")}
          </Badge>
        </div>

        {targets.length > 0 && (
          <button
            type="button"
            aria-label="Move card"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(!menuOpen);
            }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: 4,
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--bone-mute)",
              cursor: "pointer",
              display: hover || menuOpen ? "inline-flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <MoreHorizontal size={13} />
          </button>
        )}

        {menuOpen && targets.length > 0 && (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 30,
              right: 6,
              minWidth: 200,
              background: "var(--ink-elev-2)",
              border: "1px solid var(--ink-hair)",
              borderRadius: "var(--radius)",
              boxShadow: "0 16px 40px -18px rgba(0,0,0,0.6)",
              padding: 4,
              zIndex: 30,
            }}
          >
            <div
              className="eyebrow-mono"
              style={{
                padding: "6px 8px 4px",
                fontSize: 9.5,
                color: "var(--bone-mute)",
                letterSpacing: "0.16em",
              }}
            >
              Move to
            </div>
            {targets.map(({ to, transition }) => (
              <button
                key={to}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveTo(to, transition);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 8px",
                  background: "transparent",
                  border: "none",
                  color: "var(--bone)",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: 4,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--ink)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                <ArrowRight size={12} color="var(--bone-mute)" />
                <span style={{ flex: 1 }}>{transition.label}</span>
                {transition.confirm && (
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      color: "var(--amber, #e8b14a)",
                    }}
                  >
                    CONFIRM
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty / skeleton
// ---------------------------------------------------------------------------

function EmptyColumn() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 12px",
        gap: 6,
        color: "var(--bone-quiet)",
        fontSize: 11,
        textAlign: "center",
      }}
    >
      <Inbox size={16} aria-hidden />
      <span
        className="eyebrow-mono"
        style={{ fontSize: 10, letterSpacing: "0.14em" }}
      >
        — no escrows —
      </span>
    </div>
  );
}

function SkeletonStack({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            height: 74,
            borderRadius: "var(--radius)",
            background:
              "linear-gradient(90deg, var(--ink) 0%, var(--ink-elev) 50%, var(--ink) 100%)",
            backgroundSize: "200% 100%",
            animation: "kanban-shimmer 1.6s ease-in-out infinite",
            border: "1px solid var(--ink-hair)",
            opacity: 0.6 - i * 0.12,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes kanban-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (inline)
// ---------------------------------------------------------------------------

function ConfirmTransition({
  card,
  from,
  to,
  transition,
  onCancel,
  onConfirm,
}: {
  card: EscrowCard | null;
  from: EscrowLane;
  to: EscrowLane;
  transition: Transition;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true });
  }, [onCancel, busy]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={() => {
        if (!busy) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 960,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        role="alertdialog"
        aria-modal="true"
        aria-label={transition.label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--ink-elev)",
          border: "1px solid rgba(224,93,68,0.35)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 40px 80px -30px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "18px 22px 10px" }}>
          <div
            className="display"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--vermilion)",
            }}
          >
            {transition.label}?
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--bone-dim)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {transition.confirmCopy ??
              `Move this escrow from ${from} to ${to}.`}
            {card && (
              <>
                {" "}
                <br />
                <span
                  className="mono"
                  style={{ color: "var(--bone-mute)", fontSize: 11 }}
                >
                  {truncate(card.id, 8, 6)} · {formatDero(card.amount, 5)} DERO
                </span>
              </>
            )}
          </div>
        </header>
        <footer
          style={{
            padding: "12px 22px",
            background: "var(--ink)",
            borderTop: "1px solid var(--ink-hair)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "…" : `Confirm ${transition.label}`}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
