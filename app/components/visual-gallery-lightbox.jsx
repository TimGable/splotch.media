"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Palette, Video, X } from "lucide-react";
import { MentionText } from "./mention-text";
import { VideoPlayer } from "./video-player";
import { ViewportPortal } from "./viewport-portal";
import { VisualImageFrame } from "./visual-image-frame";
import { buildPublicMediaPath } from "@/lib/media-slugs";

const SWIPE_THRESHOLD = 90;

const mediaSlideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 72 : -72,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? -72 : 72,
    opacity: 0,
    scale: 0.985,
  }),
};

export function VisualGalleryLightbox({
  profile,
  items,
  currentIndex,
  onClose,
  onPrevious,
  onNext,
}) {
  const item = currentIndex >= 0 ? items[currentIndex] : null;
  const kindLabel = item?.mediaKind === "video" ? "video" : "visual art";
  const previousIndexRef = useRef(currentIndex);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (!item) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose, onNext, onPrevious]);

  useEffect(() => {
    if (currentIndex < 0) {
      previousIndexRef.current = currentIndex;
      // Direction is derived from the parent-controlled gallery index.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDirection(0);
      return;
    }

    if (previousIndexRef.current === currentIndex) {
      return;
    }

    setDirection(currentIndex > previousIndexRef.current ? 1 : -1);
    previousIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleDragEnd = (_, info) => {
    if (items.length <= 1) {
      return;
    }

    if (info.offset.x <= -SWIPE_THRESHOLD) {
      setDirection(1);
      onNext();
      return;
    }

    if (info.offset.x >= SWIPE_THRESHOLD) {
      setDirection(-1);
      onPrevious();
    }
  };

  return (
    <ViewportPortal>
      <AnimatePresence>
        {item ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/92 px-4 py-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <motion.div
              className="relative flex max-h-full w-full max-w-7xl flex-col overflow-hidden border border-white/15 bg-black/85"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-6">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">{kindLabel}</p>
                <h3 className="mt-1 truncate text-lg md:text-xl">{item.title}</h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                aria-label="Close image viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="relative flex min-h-[50vh] items-center justify-center overflow-hidden bg-white/[0.02]">
                {items.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={onPrevious}
                      className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/55 text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                      aria-label={item.mediaKind === "video" ? "Previous video" : "Previous artwork"}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                      type="button"
                      onClick={onNext}
                      className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/55 text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                      aria-label={item.mediaKind === "video" ? "Next video" : "Next artwork"}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}

                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                  <motion.div
                    key={item.id}
                    custom={direction}
                    variants={mediaSlideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.22 },
                      scale: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                    }}
                    drag={items.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.08}
                    onDragEnd={handleDragEnd}
                    className="flex h-full w-full cursor-grab touch-pan-y items-center justify-center active:cursor-grabbing"
                  >
                    {item.asset?.url ? item.mediaKind === "video" ? (
                      <VideoPlayer
                        src={item.asset.url}
                        poster={item.coverAsset?.url || ""}
                        className="max-h-[78vh] w-full"
                        allowFullscreen
                      />
                    ) : (
                      <VisualImageFrame
                        src={item.asset.url}
                        alt={item.title}
                        className="h-[78vh] w-full"
                        imageClassName="select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full min-h-[50vh] w-full items-center justify-center text-gray-600">
                        {item.mediaKind === "video" ? "video unavailable" : "image unavailable"}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <aside className="border-t border-white/10 bg-white/[0.03] p-5 lg:border-l lg:border-t-0 md:p-6">
                <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-gray-500">
                  details
                </p>

                <div className="space-y-5 text-sm">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">artist</p>
                    <p className="text-white">{profile.displayName}</p>
                    <p className="mt-1 text-gray-500">@{profile.username}</p>
                  </div>

                  <div className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400">
                    {item.mediaKind === "video" ? (
                      <Video className="h-3.5 w-3.5" />
                    ) : (
                      <Palette className="h-3.5 w-3.5" />
                    )}
                    <span>{kindLabel}</span>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">description</p>
                    <p className="leading-relaxed text-gray-300">
                      {item.description ? (
                        <MentionText text={item.description} />
                      ) : (
                        "No description added for this piece."
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">availability</p>
                    <p className="text-gray-300">{item.visibility.replace("_", " ")}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">open page</p>
                    {profile.username && item.slug ? (
                      <Link
                        href={buildPublicMediaPath(profile.username, item.slug)}
                        className="text-white transition-colors hover:text-gray-300"
                      >
                        /{profile.username}/{item.slug}
                      </Link>
                    ) : (
                      <span className="text-gray-500">Unavailable</span>
                    )}
                  </div>

                  {items.length > 1 && (
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">position</p>
                      <p className="text-gray-300">
                        {currentIndex + 1} of {items.length}
                      </p>
                    </div>
                  )}
                </div>
              </aside>
            </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ViewportPortal>
  );
}
