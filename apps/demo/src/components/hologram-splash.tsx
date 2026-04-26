"use client";

import { useEffect } from "react";
import styles from "./hologram-splash.module.css";

const SPLASH_DURATION_MS = 2400;

type HologramSplashProps = {
  visible: boolean;
  onDismiss: () => void;
};

function HologramLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={`${styles.logoSvg} ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <g className={styles.hexMain}>
        <polygon points="50,2 95,26 95,74 50,98 5,74 5,26" fill="#67e8f9" />
        <polygon points="50,7 90,28.5 90,71.5 50,93 10,71.5 10,28.5" fill="#0c1218" />
        <polygon points="50,13 83,32 83,68 50,87 17,68 17,32" fill="#22d3ee" />
      </g>
      <polygon
        className={styles.arrowTop}
        points="17,32 38,32 38,45 50,50 62,45 62,32 83,32 50,13"
        fill="#0d4a55"
      />
      <polygon
        className={styles.arrowBottom}
        points="62,68 62,55 50,50 38,55 38,68 17,68 50,87 83,68"
        fill="#0d4a55"
      />
    </svg>
  );
}

export function HologramSplash({ visible, onDismiss }: HologramSplashProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(
      onDismiss,
      reducedMotion ? 900 : SPLASH_DURATION_MS
    );

    return () => window.clearTimeout(timeout);
  }, [onDismiss, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="status"
      aria-label="Loading"
      data-hologram-splash="visible"
    >
      <div className={styles.scene}>
        <div className={styles.bgGradient} />
        <div className={styles.vignette} />
        <div className={styles.centerGlow} />
        <div className={styles.interferenceBand} />
        <div className={styles.interferenceBand} />
        <div className={styles.interferenceBand} />
        <div className={styles.logoWrapper}>
          <div className={styles.chromaR}>
            <HologramLogo />
          </div>
          <div className={styles.chromaB}>
            <HologramLogo />
          </div>
          <HologramLogo className={styles.mainLogo} />
        </div>
      </div>
    </div>
  );
}
