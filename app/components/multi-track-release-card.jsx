"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Disc3, Edit2, Ellipsis, Heart, ListPlus, MessageCircle, Pause, Play, Share2 } from "lucide-react";
import { MentionText } from "./mention-text";
import { Waveform } from "./waveform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  PAGE_TRANSITION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
  SOFT_CARD_HOVER,
} from "@/lib/motion";

function formatTrackCount(count) {
  return count === 1 ? "1 track" : `${count} tracks`;
}

function formatReleaseType(value) {
  if (value === "ep") return "EP";
  if (value === "album") return "Album";
  return "Release";
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function createSeededRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 4294967296;
  };
}

function buildWaveformData(seedSource) {
  const random = createSeededRandom(hashString(seedSource));
  return Array.from({ length: 56 }, (_, index) => {
    const base = 20 + random() * 62;
    const shaped = index % 10 === 0 ? base * 0.7 : base;
    return Math.max(10, Math.min(95, Math.round(shaped)));
  });
}

export function MultiTrackReleaseCard({
  release,
  activeTrackId,
  isPlaying,
  onOpen,
  onPlayTrack,
  onAddTrackToQueue,
  onToggleLike,
  onOpenComments,
  onEditRelease,
  onShare,
  formatUploadDate,
  formatFileSize,
  maxTrackListHeight = "max-h-44",
}) {
  const [copiedShareUrl, setCopiedShareUrl] = useState("");
  const copiedShareTimeoutRef = useRef(null);
  const tracks = release.tracks || [];
  const coverUrl = release.coverAsset?.url || tracks[0]?.coverAsset?.url || "";
  const firstTrack = tracks[0];
  const shareUrl = onShare && firstTrack ? onShare(firstTrack) : "";
  const isReleaseLiked = release.isLiked || tracks.some((track) => track.isLiked);

  useEffect(() => {
    return () => {
      if (copiedShareTimeoutRef.current) {
        window.clearTimeout(copiedShareTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyShareUrl = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(release.id);
      if (copiedShareTimeoutRef.current) {
        window.clearTimeout(copiedShareTimeoutRef.current);
      }
      copiedShareTimeoutRef.current = window.setTimeout(() => {
        setCopiedShareUrl("");
      }, 1600);
    } catch {
      setCopiedShareUrl("");
    }
  };

  return (
    <motion.div
      className="overflow-hidden border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
      whileHover={SOFT_CARD_HOVER}
      transition={PAGE_TRANSITION}
    >
      <div className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
          <motion.button
            type="button"
            onClick={() => firstTrack && onOpen?.(firstTrack)}
            className="relative mx-auto aspect-square w-32 flex-shrink-0 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] text-left transition-opacity hover:opacity-95 md:mx-0 md:h-40 md:w-40"
            whileHover={SOFT_CARD_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            {coverUrl ? (
              <img src={coverUrl} alt={release.title} className="h-full w-full object-cover object-center" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
                <Disc3 className="h-14 w-14 text-white/40" />
              </div>
            )}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/80 px-3 py-2 text-center text-[10px] uppercase leading-none tracking-[0.12em] text-white">
              <span className="block text-base font-semibold tracking-normal">{tracks.length}</span>
              <span>tracks</span>
            </div>
          </motion.button>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-300">
                    {formatReleaseType(release.releaseType)}
                  </span>
                  <span className="border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    {formatTrackCount(tracks.length)}
                  </span>
                </div>

                <motion.button
                  type="button"
                  onClick={() => firstTrack && onOpen?.(firstTrack)}
                  className="cursor-pointer text-left text-lg leading-tight transition-colors hover:text-gray-300"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  {release.title}
                </motion.button>

                {release.description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                    <MentionText text={release.description} />
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {shareUrl ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                        aria-label={`Open release options for ${release.title}`}
                      >
                        <Ellipsis className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[13.5rem] border-white/15 bg-black text-white"
                    >
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2.5 whitespace-nowrap px-3 py-2 text-white focus:bg-white/10 focus:text-white">
                          <Share2 className="h-4 w-4 text-gray-400" />
                          <span>share release</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-[min(24rem,calc(100vw-3rem))] border-white/15 bg-black text-white">
                          <div className="space-y-3 p-2">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">post url</p>
                            <div className="border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-gray-300">
                              <span className="break-all">{shareUrl}</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyShareUrl}
                              className="inline-flex w-full items-center justify-center gap-2 border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                            >
                              {copiedShareUrl === release.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              <span>{copiedShareUrl === release.id ? "copied" : "copy link"}</span>
                            </button>
                          </div>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>

            <div className={`archive-scrollbar-thin overflow-y-auto border border-white/10 bg-black/20 ${maxTrackListHeight}`}>
              {tracks.map((track, index) => {
                const isActive = activeTrackId === track.id;
                const isTrackPlaying = isActive && isPlaying;

                return (
                  <div
                    key={track.id}
                    className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-3 py-2.5 last:border-b-0"
                  >
                    <motion.button
                      type="button"
                      onClick={() => onPlayTrack?.(track, tracks)}
                      disabled={!track.asset?.url}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white transition-colors hover:border-white/45 disabled:cursor-not-allowed disabled:opacity-50"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                      aria-label={`${isTrackPlaying ? "Pause" : "Play"} ${track.title}`}
                    >
                      {isTrackPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => onOpen?.(track)}
                      className="min-w-0 text-left"
                    >
                      <span className="block truncate text-sm text-white">
                        {index + 1}. {track.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] uppercase tracking-[0.14em] text-gray-500">
                        {track.asset?.fileName || track.asset?.mimeType || "audio"}
                      </span>
                      <div className="mt-2 overflow-hidden border border-white/10 bg-white/[0.02] px-2 py-1.5">
                        <Waveform
                          data={buildWaveformData(`${track.id}:${track.asset?.fileName || track.title}`)}
                          audioUrl={track.asset?.url}
                          isPlaying={isTrackPlaying}
                          height={24}
                          disabled
                        />
                      </div>
                    </button>

                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-gray-500">
                      {track.asset?.fileSizeBytes ? <span>{formatFileSize(track.asset.fileSizeBytes)}</span> : null}
                      {onAddTrackToQueue ? (
                        <motion.button
                          type="button"
                          onClick={() => onAddTrackToQueue(track)}
                          disabled={!track.asset?.url}
                          className="inline-flex items-center gap-1 text-gray-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          whileHover={SOFT_BUTTON_HOVER}
                          whileTap={SOFT_BUTTON_TAP}
                          aria-label={`Add ${track.title} to queue`}
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                          <span className="sr-only">add to queue</span>
                        </motion.button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
              <span>Uploaded {formatUploadDate(release.createdAt)}</span>
              <span>{formatTrackCount(tracks.length)}</span>
              {onToggleLike && firstTrack ? (
                <motion.button
                  type="button"
                  onClick={() => onToggleLike(firstTrack)}
                  className={`inline-flex items-center gap-1.5 transition-colors ${
                    isReleaseLiked ? "text-white" : "hover:text-white"
                  }`}
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <Heart className={`h-3.5 w-3.5 ${isReleaseLiked ? "fill-white text-white" : ""}`} />
                  <span>{release.likes || 0}</span>
                </motion.button>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5" />
                  <span>{release.likes || 0}</span>
                </span>
              )}
              {onOpenComments && firstTrack ? (
                <motion.button
                  type="button"
                  onClick={() => onOpenComments(firstTrack)}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>{release.comments || 0}</span>
                </motion.button>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>{release.comments || 0}</span>
                </span>
              )}
              {onEditRelease && firstTrack ? (
                <motion.button
                  type="button"
                  onClick={() => onEditRelease(firstTrack)}
                  className="ml-auto inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <Edit2 className="h-4 w-4" />
                  <span>edit upload</span>
                </motion.button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
