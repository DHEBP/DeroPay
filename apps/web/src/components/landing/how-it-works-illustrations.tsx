"use client";

import { motion } from "framer-motion";

const C = "#31df90";

const Defs = ({ id }: { id: string }) => (
  <defs>
    <filter id={`glow-${id}`} x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="50%">
      <stop offset="0%" stopColor={C} stopOpacity="0.07" />
      <stop offset="100%" stopColor={C} stopOpacity="0" />
    </radialGradient>
  </defs>
);

const Waveform = () => (
  <g>
    <path
      d="M0,230 C35,230 50,222 80,222 C115,222 125,234 155,234 C185,234 200,218 230,218 C260,218 270,230 305,230 C340,230 350,224 380,224 C410,224 425,232 455,232 C475,232 490,228 500,228"
      stroke={C}
      strokeWidth="0.8"
      fill="none"
      opacity="0.25"
    />
    <circle cx="80" cy="222" r="2.5" fill={C} opacity="0.35" />
    <circle cx="230" cy="218" r="2.5" fill={C} opacity="0.35" />
    <circle cx="380" cy="224" r="2.5" fill={C} opacity="0.35" />
  </g>
);

export const AuthenticateIllustration = () => (
  <svg viewBox="0 0 500 280" fill="none" className="w-full h-auto">
    <Defs id="auth" />
    <rect width="500" height="280" fill="url(#bg-auth)" />

    <circle cx="155" cy="118" r="40" stroke={C} strokeWidth="0.8" fill="none" opacity="0.25" />
    <g filter="url(#glow-auth)">
      <circle cx="155" cy="106" r="12" stroke={C} strokeWidth="1.2" fill="none" />
      <path
        d="M136,131 C138,119 172,119 174,131"
        stroke={C}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </g>

    <line
      x1="200"
      y1="118"
      x2="300"
      y2="118"
      stroke={C}
      strokeWidth="0.6"
      strokeDasharray="4 6"
      opacity="0.15"
    />

    <motion.circle
      cy={118}
      r={4}
      fill={C}
      filter="url(#glow-auth)"
      animate={{ cx: [200, 300], opacity: [0, 0.8, 0.8, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
    />

    <circle cx="345" cy="118" r="40" stroke={C} strokeWidth="0.8" fill="none" opacity="0.25" />
    <g filter="url(#glow-auth)">
      <path
        d="M327,118 L339,130 L363,106"
        stroke={C}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>

    <Waveform />
  </svg>
);

export const PayIllustration = () => (
  <svg viewBox="0 0 500 280" fill="none" className="w-full h-auto">
    <Defs id="pay" />
    <rect width="500" height="280" fill="url(#bg-pay)" />

    {[0, 1, 2].map((i) => (
      <motion.circle
        key={i}
        cx={250}
        cy={118}
        stroke={C}
        strokeWidth="0.8"
        fill="none"
        initial={{ r: 36, opacity: 0.35 }}
        animate={{ r: [36, 75], opacity: [0.35, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: i * 1 }}
      />
    ))}

    <g filter="url(#glow-pay)">
      <polygon
        points="250,82 282,99 282,134 250,151 218,134 218,99"
        stroke={C}
        strokeWidth="1.5"
        fill="none"
      />
      <g transform="translate(250,116.5) scale(1.05) translate(-50,-47.6)">
        <path
          d="M58.3,54.8v-9.6l-8.3-4.8-8.3,4.8v9.6l4.6,2.7c-.2,1.4-2.3,15-2.4,15.8l6.1,3.5,6.2-3.6c-.1-.7-2.2-14.4-2.4-15.8l4.5-2.6Z"
          stroke={C}
          strokeWidth="1.2"
          fill="none"
          opacity="0.6"
        />
      </g>
    </g>

    <Waveform />
  </svg>
);

export const ProtectIllustration = () => (
  <svg viewBox="0 0 500 280" fill="none" className="w-full h-auto">
    <Defs id="protect" />
    <rect width="500" height="280" fill="url(#bg-protect)" />

    <motion.circle
      cx={250}
      cy={118}
      r={62}
      stroke={C}
      strokeWidth="0.6"
      strokeDasharray="8 6"
      fill="none"
      opacity="0.2"
      animate={{ strokeDashoffset: [0, -84] }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />

    <g filter="url(#glow-protect)">
      <motion.path
        d="M250,78 L288,96 L288,132 C288,156 250,168 250,168 C250,168 212,156 212,132 L212,96 Z"
        stroke={C}
        strokeWidth="1.5"
        fill="none"
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </g>

    <g opacity="0.75">
      <rect x="237" y="121" width="26" height="20" rx="3" stroke={C} strokeWidth="1.2" fill="none" />
      <path
        d="M242,121 L242,113 C242,105 258,105 258,113 L258,121"
        stroke={C}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="250" cy="132" r="3" fill={C} opacity="0.5" />
    </g>

    <Waveform />
  </svg>
);
