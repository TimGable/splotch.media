"use client";

import { motion } from "motion/react";
import { PAGE_TRANSITION, SOFT_EASE } from "@/lib/motion";

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ArchiveLoadingState({
  label = "loading",
  progress = 0,
  className = "",
}) {
  const safeProgress = clampProgress(progress);
  const bars = [0, 1, 2, 3];

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-30 grid place-items-center px-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={PAGE_TRANSITION}
    >
      <div className={`relative flex items-center justify-center ${className}`.trim()}>
        <motion.div
          className="absolute h-16 w-16 rounded-full bg-white/14 blur-2xl md:h-20 md:w-20"
          animate={{ opacity: [0.16, 0.28, 0.16], scale: [0.96, 1.04, 0.96] }}
          transition={{ duration: 2.4, ease: SOFT_EASE, repeat: Infinity }}
        />
        <motion.div
          className="absolute h-12 w-12 rounded-full border border-white/12 blur-lg md:h-16 md:w-16"
          animate={{ opacity: [0.14, 0.24, 0.14] }}
          transition={{ duration: 1.9, ease: SOFT_EASE, repeat: Infinity }}
        />
        <div className="relative flex h-10 items-end gap-1.5 md:h-12 md:gap-2">
          {bars.map((barIndex) => (
            <motion.div
              key={barIndex}
              className="relative w-1.5 overflow-hidden rounded-full bg-white/[0.08] md:w-2"
              animate={{
                scaleY: [0.48, 1, 0.64, 0.84, 0.48],
                opacity: [0.34, 0.96, 0.5, 0.8, 0.34],
              }}
              transition={{
                duration: 1.45,
                ease: SOFT_EASE,
                repeat: Infinity,
                delay: barIndex * 0.08,
              }}
              style={{
                height: `${18 + (barIndex % 2 === 0 ? 8 : 0)}px`,
                transformOrigin: "bottom",
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.9),rgba(255,255,255,0.2),rgba(255,255,255,0.03))]" />
              <div className="absolute inset-[1px] rounded-full shadow-[0_0_18px_rgba(255,255,255,0.2)]" />
            </motion.div>
          ))}
        </div>
        <span className="sr-only">
          {label} {safeProgress}%
        </span>
      </div>
    </motion.div>
  );
}
