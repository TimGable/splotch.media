import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Edit2, Ellipsis, Heart, ListPlus, MessageCircle, Music2, Pause, Play, Share2 } from "lucide-react";
import { MentionText } from "./mention-text";
import { Waveform } from "./waveform";
import { FadeInImage } from "./fade-in-image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  return Array.from({ length: 72 }, (_, index) => {
    const base = 22 + random() * 58;
    const shaped = index % 9 === 0 ? base * 0.65 : base;
    return Math.max(10, Math.min(95, Math.round(shaped)));
  });
}

export function MusicReleasePlayer({
  item,
  isActive,
  isPlaying,
  onOpen,
  onPlayPause,
  onAddToQueue,
  onShare,
  onEdit,
  subtitle,
  onSubtitleClick,
  onToggleLike,
  onOpenComments,
  isLikePending,
  currentTime,
  duration,
  onSeek,
  formatFileSize,
  formatUploadDate,
  formatReleaseType,
}) {
  const [copiedShareUrl, setCopiedShareUrl] = useState("");
  const copiedShareTimeoutRef = useRef(null);
  const waveformData = useMemo(
    () => buildWaveformData(`${item.id}:${item.asset?.fileName || item.title}`),
    [item.asset?.fileName, item.id, item.title],
  );
  const progress = duration > 0 ? currentTime / duration : 0;
  const hasActions = Boolean(onAddToQueue || onShare);
  const shareUrl = onShare ? onShare(item) : "";

  useEffect(() => {
    return () => {
      if (copiedShareTimeoutRef.current) {
        window.clearTimeout(copiedShareTimeoutRef.current);
      }
    };
  }, []);

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(item.id);
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
      <div className="p-3 md:p-5">
        <div className="relative grid gap-3 md:flex md:flex-row md:items-center md:gap-5">
          <motion.button
            type="button"
            onClick={() => onOpen(item)}
            className="absolute left-0 top-0 h-16 w-16 flex-shrink-0 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] text-left transition-opacity hover:opacity-95 sm:h-20 sm:w-20 md:relative md:left-auto md:top-auto md:h-40 md:w-40"
            whileHover={SOFT_CARD_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            {item.coverAsset?.url ? (
              <FadeInImage
                src={item.coverAsset.url}
                alt={item.title}
                className="h-full w-full object-cover object-center"
                containerClassName="h-full w-full"
                style={{
                  WebkitMaskImage:
                    "radial-gradient(circle at center, black 68%, rgba(0,0,0,0.92) 78%, transparent 100%)",
                  maskImage:
                    "radial-gradient(circle at center, black 68%, rgba(0,0,0,0.92) 78%, transparent 100%)",
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
                <Music2 className="h-8 w-8 text-white/40 md:h-14 md:w-14" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_62%,rgba(0,0,0,0.18)_100%)]" />
          </motion.button>

          <div className="min-w-0 flex-1">
          <div className="mb-3 ml-20 flex min-h-16 items-start justify-between gap-2 sm:ml-24 sm:min-h-20 md:mb-4 md:ml-0 md:min-h-0 md:gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 hidden flex-wrap gap-2 sm:flex md:mb-2">
                {item.releaseType && (
                  <span className="border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300 md:px-2.5 md:text-[11px] md:tracking-[0.2em]">
                    {formatReleaseType(item.releaseType)}
                  </span>
                )}
                <span className="border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-500 md:px-2.5 md:text-[11px] md:tracking-[0.2em]">
                  {item.visibility.replace("_", " ")}
                </span>
              </div>
              <motion.button
                type="button"
                onClick={() => onOpen(item)}
                className="cursor-pointer text-left text-sm leading-tight transition-colors hover:text-gray-300 sm:text-base md:text-lg"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                {item.title}
              </motion.button>
              {subtitle ? (
                onSubtitleClick ? (
                  <motion.button
                    type="button"
                    onClick={() => onSubtitleClick(item)}
                    className="mt-1 cursor-pointer text-left text-sm uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-300"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    {subtitle}
                  </motion.button>
                ) : (
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500 md:text-sm md:tracking-[0.18em]">{subtitle}</p>
                )
              ) : null}
              {item.description && (
                <p className="mt-2 hidden max-w-2xl text-sm leading-relaxed text-gray-400 md:block">
                  <MentionText text={item.description} />
                </p>
              )}
            </div>

            {hasActions ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white md:h-10 md:w-10"
                    aria-label={`Open track options for ${item.title}`}
                  >
                    <Ellipsis className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-[13.5rem] border-white/15 bg-black text-white"
                >
                  {onAddToQueue && (
                    <DropdownMenuItem
                      onClick={() => onAddToQueue(item)}
                      className="gap-2.5 whitespace-nowrap px-3 py-2 text-white focus:bg-white/10 focus:text-white"
                    >
                      <ListPlus className="h-4 w-4 text-gray-400" />
                      <span>add to queue</span>
                    </DropdownMenuItem>
                  )}
                  {onShare && shareUrl ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2.5 whitespace-nowrap px-3 py-2 text-white focus:bg-white/10 focus:text-white">
                        <Share2 className="h-4 w-4 text-gray-400" />
                        <span>share track</span>
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
                            {copiedShareUrl === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copiedShareUrl === item.id ? "copied" : "copy link"}</span>
                          </button>
                        </div>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="grid gap-2 md:gap-4">
            <div className="flex items-center gap-2.5 md:gap-3">
              <motion.button
                type="button"
                onClick={() => onPlayPause(item)}
                disabled={!item.asset?.url}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-white transition-transform hover:scale-[1.03] hover:border-white/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50 md:h-12 md:w-12"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                {isPlaying && isActive ? (
                  <Pause className="h-4.5 w-4.5" />
                ) : (
                  <Play className="ml-0.5 h-4.5 w-4.5" />
                )}
              </motion.button>

              <div className="min-w-0 flex-1">
                <div className="relative mb-1.5 overflow-hidden border border-white/10 bg-white/[0.02] px-2 py-1.5 md:mb-2 md:px-3 md:py-2.5">
                  <Waveform
                    data={waveformData}
                    audioUrl={item.asset?.url}
                    isPlaying={isPlaying && isActive}
                    height={26}
                    progress={isActive ? progress : 0}
                    currentTime={isActive ? currentTime : 0}
                    duration={isActive ? duration : 0}
                    onSeek={isActive ? onSeek : undefined}
                    seekLabel={`Seek ${item.title}`}
                    disabled={!isActive}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-gray-500 md:text-xs md:tracking-[0.16em]">
                  <span>{isActive ? formatTime(currentTime) : ""}</span>
                  <span>{isActive ? formatTime(duration) : ""}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                <span>Uploaded {formatUploadDate(item.createdAt)}</span>
                {onToggleLike ? (
                  <motion.button
                    type="button"
                    onClick={() => onToggleLike(item)}
                    disabled={isLikePending}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      item.isLiked ? "text-white" : "hover:text-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <Heart className={`h-3.5 w-3.5 ${item.isLiked ? "fill-white text-white" : ""}`} />
                    <span>{item.likes || 0}</span>
                  </motion.button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5" />
                    <span>{item.likes || 0}</span>
                  </span>
                )}
                {onOpenComments ? (
                  <motion.button
                    type="button"
                    onClick={() => onOpenComments(item)}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>{item.comments || 0}</span>
                  </motion.button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>{item.comments || 0}</span>
                  </span>
                )}
              </div>

              {onEdit ? (
                <motion.button
                  type="button"
                  onClick={() => onEdit(item)}
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
      </div>
    </motion.div>
  );
}
