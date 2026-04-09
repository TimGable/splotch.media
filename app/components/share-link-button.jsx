"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Share2 } from "lucide-react";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

export function ShareLinkButton({
  url,
  label = "share",
  iconOnly = false,
  className = "",
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const containerRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setIsCopied(false);
      }, 1600);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={className}
        aria-label={ariaLabel || label}
        whileHover={SOFT_BUTTON_HOVER}
        whileTap={SOFT_BUTTON_TAP}
      >
        <Share2 className="h-4 w-4" />
        {!iconOnly ? <span>{label}</span> : null}
      </motion.button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="absolute right-0 top-full z-30 mt-3 w-[min(26rem,calc(100vw-2.5rem))] overflow-hidden border border-white/15 bg-black/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            {...SOFT_PANEL_REVEAL}
            transition={PAGE_TRANSITION}
          >
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">post url</p>
            <div className="border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-gray-300">
              <span className="break-all">{url}</span>
            </div>

            <div className="mt-3 flex justify-end">
              <motion.button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopied ? "copied" : "copy link"}</span>
              </motion.button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
