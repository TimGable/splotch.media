"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  poster = "",
  className = "",
  ratioClass = "aspect-video",
  autoPlay = false,
  muted = true,
  loop = false,
  allowFullscreen = true,
  useIntrinsicAspect = true,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);
  const [isHovering, setIsHovering] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(null);
  const [volume, setVolume] = useState(1);
  const [isVolumeHovering, setIsVolumeHovering] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const idleTimeoutRef = useRef(null);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncPointerMode = () => {
      setIsCoarsePointer(pointerQuery.matches);
    };

    syncPointerMode();
    pointerQuery.addEventListener("change", syncPointerMode);

    return () => pointerQuery.removeEventListener("change", syncPointerMode);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handlePointerActivity = useCallback(
    (force = false) => {
      const shouldRunTimer = isFullscreen && isPlaying;
      if (!force && !shouldRunTimer) {
        return;
      }
      setIsIdle(false);
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      if (shouldRunTimer) {
        idleTimeoutRef.current = window.setTimeout(() => {
          setIsIdle(true);
        }, 2200);
      }
    },
    [isFullscreen, isPlaying],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      handlePointerActivity(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen, isPlaying, handlePointerActivity]);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const handleMove = () => {
      handlePointerActivity();
    };

    document.addEventListener("mousemove", handleMove);
    return () => document.removeEventListener("mousemove", handleMove);
  }, [handlePointerActivity, isFullscreen]);

  const toggleMute = () => {
    setIsMuted((current) => !current);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setDuration(video.duration || 0);
    setCurrentTime(video.currentTime || 0);
    setIsReady(true);
    if (video.videoWidth && video.videoHeight) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
    }
    const initialVolume = video.volume ?? 1;
    setVolume(initialVolume);
    if (initialVolume === 0) {
      setIsMuted(true);
    }
    if (autoPlay) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setCurrentTime(video.currentTime || 0);
  };

  const handleSeek = (event) => {
    const video = videoRef.current;
    if (!video || !duration) {
      return;
    }

    const nextProgress = Number(event.target.value);
    video.currentTime = nextProgress * duration;
    setCurrentTime(video.currentTime);
  };

  const handleToggleFullscreen = async () => {
    if (!allowFullscreen) {
      return;
    }

    const video = videoRef.current;
    if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
      await containerRef.current.requestFullscreen();
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }

    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const effectiveAspectStyle = isFullscreen
    ? { width: "100%", height: "100%" }
    : useIntrinsicAspect && videoAspectRatio
      ? { aspectRatio: videoAspectRatio }
      : undefined;

  const handleVolumeChange = (event) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    if (nextVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const shouldShowControls =
    !isPlaying ||
    !isReady ||
    (!isFullscreen && isHovering) ||
    (isFullscreen && !isIdle) ||
    isVolumeHovering;
  const shouldShowCenterButton = !isPlaying || (!isCoarsePointer && shouldShowControls);

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-[0_20px_65px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out hover:scale-[1.01] hover:shadow-[0_28px_85px_rgba(0,0,0,0.6)] ${isFullscreen && isIdle ? "cursor-none" : "cursor-default"} ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={() => handlePointerActivity()}
      onTouchStart={() => handlePointerActivity(true)}
    >
      <div
        className={`relative overflow-hidden ${isFullscreen ? "h-full w-full" : ratioClass}`}
        style={effectiveAspectStyle}
      >
        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          playsInline
          loop={loop}
          muted={isMuted}
          poster={poster}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          controls={isCoarsePointer}
          controlsList="nodownload"
        >
          {src ? <source src={src} /> : null}
        </video>

        {!isCoarsePointer ? (
          <button
            type="button"
            onClick={togglePlay}
            className={`pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity ${
              shouldShowCenterButton ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white shadow-lg backdrop-blur-md md:h-16 md:w-16">
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-1 h-6 w-6" />}
            </span>
          </button>
        ) : null}

        {!isCoarsePointer ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 transition-opacity md:p-4 ${
              shouldShowControls ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="pointer-events-auto space-y-3 text-xs text-white">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:border-white/60"
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>
                <div className="flex-1">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white to-white/70"
                      style={{ width: `${progress * 100}%` }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.001"
                      value={progress}
                      aria-label="Seek"
                      onChange={handleSeek}
                      className="absolute inset-0 h-1.5 w-full cursor-pointer appearance-none opacity-0"
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.18em] text-white/80">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <div
                  className="flex flex-row-reverse items-center gap-2"
                  onMouseEnter={() => setIsVolumeHovering(true)}
                  onMouseLeave={() => setIsVolumeHovering(false)}
                >
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:border-white/60"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <div
                    className={`flex items-center overflow-hidden rounded-full border border-white/30 bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white transition-all duration-200 ${
                      isVolumeHovering ? "max-w-[9rem] opacity-100" : "max-w-0 opacity-0 pointer-events-none"
                    }`}
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="h-1 w-24 cursor-pointer accent-white"
                      aria-label="Volume"
                    />
                  </div>
                </div>
                {allowFullscreen ? (
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:border-white/60"
                    aria-label="Toggle fullscreen"
                    aria-pressed={isFullscreen}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
