"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Music2, Palette, Video } from "lucide-react";
import { FadeInImage } from "./fade-in-image";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

function getLikedItemIcon(mediaKind) {
  if (mediaKind === "visual") {
    return <Palette className="h-4 w-4 text-white/50" />;
  }

  if (mediaKind === "video") {
    return <Video className="h-4 w-4 text-white/50" />;
  }

  return <Music2 className="h-4 w-4 text-white/50" />;
}

function getLikedItemLabel(item) {
  if (item.mediaKind === "music") {
    if (item.releaseType === "album") return "album";
    if (item.releaseType === "ep") return "EP";
    return "song";
  }

  if (item.mediaKind === "visual") return "art";
  if (item.mediaKind === "video") return "video";
  return "post";
}

export function LikedTracksPanel({ likedTracks = [], onOpenTrack }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center gap-3 border border-white/15 bg-white/[0.03] px-4 py-3 text-left text-sm text-gray-300 transition-colors hover:border-white/35 hover:bg-white/[0.06] hover:text-white"
        whileHover={SOFT_BUTTON_HOVER}
        whileTap={SOFT_BUTTON_TAP}
      >
        <Heart className="h-4 w-4" />
        <span className="uppercase tracking-[0.18em] text-[11px] text-gray-500">likes</span>
        <span className="text-white">{likedTracks.length}</span>
      </motion.button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="absolute left-0 top-full z-40 mt-3 w-[min(18rem,calc(100vw-2rem))] overflow-hidden border border-white/15 bg-black/95 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl md:bottom-0 md:left-auto md:right-0 md:top-auto md:z-20 md:mt-0 md:w-[min(28rem,calc(100vw-3rem))] md:translate-y-[calc(100%+0.75rem)]"
            {...SOFT_PANEL_REVEAL}
            transition={PAGE_TRANSITION}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">
                likes
              </p>
            </div>

            {likedTracks.length > 0 ? (
              <div className="scrollbar-hidden max-h-[calc(100dvh-10rem)] overflow-x-hidden overflow-y-auto md:max-h-[24rem]">
                {likedTracks.map((track) => (
                  <motion.button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenTrack?.(track);
                    }}
                    className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.04]"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.04]">
                      {track.previewUrl || track.coverArtUrl ? (
                        <FadeInImage
                          src={track.previewUrl || track.coverArtUrl}
                          alt={track.title}
                          className="h-full w-full object-cover"
                          containerClassName="h-full w-full"
                        />
                      ) : (
                        getLikedItemIcon(track.mediaKind)
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{track.title}</p>
                      <p className="truncate text-[11px] uppercase tracking-[0.16em] text-gray-500">
                        {getLikedItemLabel(track)} / {track.artist.displayName}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500">
                no likes yet.
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
