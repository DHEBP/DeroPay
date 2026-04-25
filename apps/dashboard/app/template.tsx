"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Route transition wrapper. Next.js re-mounts this template on every
 * route change, so keying on pathname drives the animation cleanly.
 *
 * 180ms fade + 8 px rise is the sweet spot — noticeable enough to
 * register as polish, short enough to feel responsive. Users with
 * `prefers-reduced-motion` get an instant cut.
 */
export default function RouteTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.18,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ minHeight: "100%" }}
    >
      {children}
    </motion.div>
  );
}
