import { motion } from "motion/react";
import { ViewportPortal } from "./viewport-portal";
import { PAGE_TRANSITION, SOFT_PANEL_REVEAL } from "@/lib/motion";

export function UploadProgressModal({ progress = 0 }) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedProgress / 100) * circumference;

  return ( 
    <ViewportPortal>
      <motion.div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={PAGE_TRANSITION}
      >
        <motion.div
          className="flex min-w-[13rem] flex-col items-center border border-white/20 bg-black px-8 py-7 shadow-[0_0_40px_rgba(255,255,255,0.08)]"
          {...SOFT_PANEL_REVEAL}
          transition={PAGE_TRANSITION}
        >
          <div className="relative h-24 w-24">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="4"
              />
              <motion.circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.92)"
                strokeLinecap="round"
                strokeWidth="4"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm tabular-nums text-white">
              {normalizedProgress}%
            </div>
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-gray-400">
            uploading
          </p>
        </motion.div>
      </motion.div>
    </ViewportPortal>
  );
}
