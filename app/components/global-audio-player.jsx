import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Music2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { buildPublicMediaPath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_CARD_HOVER, SOFT_PANEL_REVEAL } from "@/lib/motion";

function formatTime(time) {
  if (Number.isNaN(time) || !Number.isFinite(time) || time < 0) {
    return "0:00";
  }

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function GlobalAudioPlayer({
  currentTrack,
  playbackQueue,
  queueIndex,
  isClosing,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onTrackEnd,
  canSkipPrevious,
  canSkipNext,
  onSkipPrevious,
  onSkipNext,
  onQueueSelect,
  onQueueMove,
  onQueueRemove,
  onClose,
  onTimeChange,
  onDurationChange,
  onSeek,
  onVolumeChange,
  onMuteToggle,
}) {
  const router = useRouter();
  const audioRef = useRef(null);
  const queuePanelRef = useRef(null);
  const [showQueue, setShowQueue] = useState(false);
  const coverArt = currentTrack?.release?.coverArt;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const canOpenTrackPage = Boolean(currentTrack?.artist?.username && currentTrack?.track?.slug);

  useEffect(() => {
    if (!showQueue) {
      return;
    }

    const handlePointerDown = (event) => {
      if (!queuePanelRef.current?.contains(event.target)) {
        setShowQueue(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showQueue]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    if (isPlaying) {
      audioRef.current.play().catch(() => {});
      return;
    }

    audioRef.current.pause();
  }, [isPlaying, currentTrack?.track?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (!audioRef.current || !Number.isFinite(currentTime)) {
      return;
    }

    const nextTime = Math.max(0, currentTime);
    if (Math.abs((audioRef.current.currentTime || 0) - nextTime) > 0.15) {
      audioRef.current.currentTime = nextTime;
    }
  }, [currentTime, currentTrack?.track?.audioUrl]);

  const openCurrentTrackPage = () => {
    if (!canOpenTrackPage) {
      return;
    }

    router.push(
      buildPublicMediaPath(currentTrack.artist.username, currentTrack.track.slug),
    );
  };

  return (
    <motion.div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/92 backdrop-blur-xl ${
        isClosing ? "pointer-events-none" : ""
      }`}
      initial={{ y: 100, opacity: 0, filter: "blur(8px)" }}
      animate={
        isClosing
          ? { y: 48, opacity: 0, filter: "blur(10px)" }
          : { y: 0, opacity: 1, filter: "blur(0px)" }
      }
      transition={PAGE_TRANSITION}
    >
      <audio
        ref={audioRef}
        src={currentTrack.track.audioUrl}
        onTimeUpdate={() => onTimeChange(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => onDurationChange(audioRef.current?.duration || 0)}
        onEnded={onTrackEnd}
      />

      <div className="relative h-1 w-full bg-white/5">
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={(event) => onSeek(Number(event.target.value), audioRef.current)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          aria-label={`Seek ${currentTrack.track.title}`}
        />
        <div className="absolute left-0 top-0 h-full bg-white transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <motion.button
            type="button"
            onClick={openCurrentTrackPage}
            disabled={!canOpenTrackPage}
            className="h-14 w-14 flex-shrink-0 overflow-hidden border border-white/10 bg-white/5 transition-colors hover:border-white/35 disabled:cursor-default disabled:hover:border-white/10"
            whileHover={canOpenTrackPage ? SOFT_CARD_HOVER : undefined}
            whileTap={canOpenTrackPage ? SOFT_BUTTON_TAP : undefined}
          >
            {coverArt ? (
              <img
                src={coverArt}
                alt={currentTrack.release.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
                <Music2 className="h-5 w-5 text-white/60" />
              </div>
            )}
          </motion.button>

          <div className="min-w-0 flex-1">
            <motion.button
              type="button"
              onClick={openCurrentTrackPage}
              disabled={!canOpenTrackPage}
              className="block max-w-full cursor-pointer truncate text-left text-sm tracking-wide transition-colors hover:text-gray-300 disabled:cursor-default disabled:hover:text-white"
              whileHover={canOpenTrackPage ? SOFT_BUTTON_HOVER : undefined}
              whileTap={canOpenTrackPage ? SOFT_BUTTON_TAP : undefined}
            >
              {currentTrack.track.title}
            </motion.button>
            <p className="truncate text-xs uppercase tracking-[0.16em] text-gray-500">
              {currentTrack.artist.name}
              {currentTrack.release.title ? ` / ${currentTrack.release.title}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <span className="hidden w-12 text-right text-xs text-gray-500 md:block">
            {formatTime(currentTime)}
          </span>

          <motion.button
            onClick={onSkipPrevious}
            disabled={!canSkipPrevious}
            className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            whileHover={canSkipPrevious ? SOFT_BUTTON_HOVER : undefined}
            whileTap={canSkipPrevious ? SOFT_BUTTON_TAP : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>

          <motion.button
            onClick={onPlayPause}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 transition-all hover:border-white/60 hover:bg-white/5"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </motion.button>

          <motion.button
            onClick={onSkipNext}
            disabled={!canSkipNext}
            className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            whileHover={canSkipNext ? SOFT_BUTTON_HOVER : undefined}
            whileTap={canSkipNext ? SOFT_BUTTON_TAP : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.button>

          <span className="hidden w-12 text-xs text-gray-500 md:block">{formatTime(duration)}</span>
        </div>

        <div className="relative" ref={queuePanelRef}>
          <motion.button
            type="button"
            onClick={() => setShowQueue((current) => !current)}
            className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
            aria-label="Open queue"
          >
            <ListMusic className="h-4.5 w-4.5" />
          </motion.button>

          <AnimatePresence>
            {showQueue ? (
              <motion.div
                className="absolute bottom-14 right-0 z-20 w-[min(24rem,calc(100vw-2rem))] overflow-hidden border border-white/15 bg-black/96 shadow-[0_18px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                {...SOFT_PANEL_REVEAL}
                transition={PAGE_TRANSITION}
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">
                    queue
                  </p>
                </div>

                <div className="scrollbar-hidden max-h-[22rem] overflow-y-auto">
                  {playbackQueue?.length ? (
                    playbackQueue.map((entry, index) => {
                      const isActiveEntry = index === queueIndex;

                      return (
                        <motion.div
                          key={`${entry.track.id}-${index}`}
                          className={`flex items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0 ${
                            isActiveEntry ? "bg-white/[0.05]" : ""
                          }`}
                          whileHover={SOFT_CARD_HOVER}
                          transition={PAGE_TRANSITION}
                        >
                          <motion.button
                            type="button"
                            onClick={() => {
                              onQueueSelect?.(index);
                              setShowQueue(false);
                            }}
                            className="min-w-0 flex-1 text-left"
                            whileHover={SOFT_BUTTON_HOVER}
                            whileTap={SOFT_BUTTON_TAP}
                            transition={PAGE_TRANSITION}
                          >
                            <p className="truncate text-sm text-white">{entry.track.title}</p>
                            <p className="truncate text-[11px] uppercase tracking-[0.16em] text-gray-500">
                              {entry.artist.name}
                            </p>
                          </motion.button>

                          <div className="flex items-center gap-1">
                            <motion.button
                              type="button"
                              onClick={() => onQueueMove?.(index, index - 1)}
                              disabled={index === 0}
                              className="flex h-8 w-8 items-center justify-center text-gray-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Move ${entry.track.title} up`}
                              whileHover={index === 0 ? undefined : SOFT_BUTTON_HOVER}
                              whileTap={index === 0 ? undefined : SOFT_BUTTON_TAP}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => onQueueMove?.(index, index + 1)}
                              disabled={index === (playbackQueue?.length || 0) - 1}
                              className="flex h-8 w-8 items-center justify-center text-gray-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Move ${entry.track.title} down`}
                              whileHover={index === (playbackQueue?.length || 0) - 1 ? undefined : SOFT_BUTTON_HOVER}
                              whileTap={index === (playbackQueue?.length || 0) - 1 ? undefined : SOFT_BUTTON_TAP}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => onQueueRemove?.(index)}
                              className="flex h-8 w-8 items-center justify-center text-gray-500 transition-colors hover:text-red-300"
                              aria-label={`Remove ${entry.track.title}`}
                              whileHover={SOFT_BUTTON_HOVER}
                              whileTap={SOFT_BUTTON_TAP}
                            >
                              <X className="h-3.5 w-3.5" />
                            </motion.button>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="px-4 py-6 text-sm text-gray-500">queue is empty.</div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <motion.button
            onClick={onMuteToggle}
            className="text-gray-400 transition-colors hover:text-white"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </motion.button>

          <div className="relative h-8 w-28">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label="Adjust volume"
            />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
            <div
              className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-white"
              style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-black bg-white"
              style={{ left: `calc(${(isMuted ? 0 : volume) * 100}% - 5px)` }}
            />
          </div>
        </div>

        <div className="ml-auto flex min-w-[3.5rem] items-center justify-end gap-3 text-right text-[11px] uppercase tracking-[0.18em] text-gray-500">
          <span>{formatTime(currentTime)}</span>

          <motion.button
            type="button"
            onClick={onClose}
            className="hidden h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white md:flex"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            <X className="h-4 w-4" />
          </motion.button>

          <motion.button
            type="button"
            onClick={onClose}
            className="block border border-white/15 px-2 py-1 text-[10px] text-gray-400 transition-colors hover:border-white/40 hover:text-white md:hidden"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            close
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
