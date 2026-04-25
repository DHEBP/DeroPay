"use client";

import { forwardRef } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * 28x28 three-dot button, used as the trigger for {@link Menu} inside
 * drawer headers. Matches the visual grammar of the bell + theme-toggle
 * buttons in `notification-bell.tsx` / `theme-toggle.tsx`: transparent by
 * default, subtle border on hover, elevated background when the attached
 * popover is open (signalled via `aria-expanded`).
 */
type Props = {
  ariaLabel: string;
  /** Wired by the parent `<Menu>` via cloneElement. */
  "aria-expanded"?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  // React's built-in aria attribute typings narrow `aria-haspopup` to this
  // union, so we mirror it here instead of accepting an open `string` —
  // otherwise a cross-page cloneElement can smuggle in an invalid role.
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
};

export const KebabButton = forwardRef<HTMLButtonElement, Props>(
  function KebabButton(props, ref) {
    const { ariaLabel, onClick, onKeyDown } = props;
    const expanded = props["aria-expanded"] ?? false;
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup={props["aria-haspopup"] ?? "menu"}
        aria-expanded={expanded}
        onClick={onClick}
        onKeyDown={onKeyDown}
        style={{
          width: 28,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: expanded ? "var(--ink-elev-2)" : "transparent",
          border: "1px solid",
          borderColor: expanded ? "var(--ink-hair-strong)" : "var(--ink-hair)",
          borderRadius: 6,
          color: expanded ? "var(--bone)" : "var(--bone-mute)",
          cursor: "pointer",
          padding: 0,
          transition: "color 0.15s, background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!expanded) {
            e.currentTarget.style.color = "var(--bone)";
            e.currentTarget.style.borderColor = "var(--ink-hair-strong)";
          }
        }}
        onMouseLeave={(e) => {
          if (!expanded) {
            e.currentTarget.style.color = "var(--bone-mute)";
            e.currentTarget.style.borderColor = "var(--ink-hair)";
          }
        }}
      >
        <MoreHorizontal size={14} strokeWidth={1.8} />
      </button>
    );
  },
);
