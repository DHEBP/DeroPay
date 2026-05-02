"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const FeatureCard = ({
  icon,
  title,
  description,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  glow?: string;
  className?: string;
}) => {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`glass-panel soft-outline group relative flex h-full flex-col justify-between rounded-[1.5rem] p-6 transition-colors duration-300 hover:border-[var(--color-border-hover)] ${className}`}
    >
      <div>
        {icon && (
          <div className="mb-5 inline-flex items-center justify-center rounded-full bg-[var(--color-accent-dim)] p-2.5 text-[var(--color-accent)]">
            {icon}
          </div>
        )}
        <h3 className="mb-2 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
          {title}
        </h3>
        <p className="text-pretty text-sm leading-6 text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>
    </motion.div>
  );
};
