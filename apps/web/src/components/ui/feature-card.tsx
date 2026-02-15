"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const FeatureCard = ({
  icon,
  title,
  description,
  glow,
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
      className={`group relative flex h-full flex-col justify-between rounded-2xl border border-[#1e2a24] bg-black p-6 transition-all duration-300 hover:border-[#4a6356] ${className}`}
    >
      <div>
        {icon && (
          <div
            className="mb-5 text-[#10b981]"
            style={{
              display: "inline-flex",
              padding: "10px",
              borderRadius: "50%",
              background: "#0a1f17",
            }}
          >
            {icon}
          </div>
        )}
        <h3 className="mb-2 text-base font-bold text-[#f0fdf4]">{title}</h3>
        <p className="text-sm font-medium leading-relaxed text-[#6b7f75]">
          {description}
        </p>
      </div>
    </motion.div>
  );
};
