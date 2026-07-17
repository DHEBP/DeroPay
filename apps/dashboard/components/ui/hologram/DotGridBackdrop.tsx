type Props = {
  position?: "fixed" | "absolute";
};

export function DotGridBackdrop({ position = "absolute" }: Props = {}) {
  return (
    <div
      aria-hidden
      style={{
        position,
        inset: 0,
        backgroundImage:
          "radial-gradient(circle, var(--sage-dot) 1px, transparent 1px)",
        backgroundSize: "var(--dot-grid-size) var(--dot-grid-size)",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
