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

function shouldUseNativeVideoControls() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return true;
  }

  const userAgent = navigator.userAgent || "";
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(userAgent);
  const hasTouchInput =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(any-pointer: coarse)")?.matches ||
    window.matchMedia?.("(hover: none)")?.matches;
  const isSmallViewport = window.matchMedia?.("(max-width: 900px)")?.matches;

  return isMobileUserAgent || (hasTouchInput && isSmallViewport);
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
  const [usesNativeControls, setUsesNativeControls] = useState(true);
  const idleTimeoutRef = useRef(null);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(any-pointer: coarse)");
    const hoverQuery = window.matchMedia("(hover: none)");
    const viewportQuery = window.matchMedia("(max-width: 900px)");
    const syncControlMode = () => {
      setUsesNativeControls(shouldUseNativeVideoControls());
    };

    syncControlMode();
    pointerQuery.addEventListener("change", syncControlMode);
    hoverQuery.addEventListener("change", syncControlMode);
    viewportQuery.addEventListener("change", syncControlMode);

    return () => {
      pointerQuery.removeEventListener("change", syncControlMode);
      hoverQuery.removeEventListener("change", syncControlMode);
      viewportQuery.removeEventListener("change", syncControlMode);
    };
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
  const shouldShowCenterButton = !isPlaying || (!usesNativeControls && shouldShowControls);
  const controlButtonClass =
    "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50";

  if (usesNativeControls) {
    return (
      <div ref={containerRef} className={`relative overflow-hidden bg-black ${className}`}>
        <div
          className={`relative overflow-hidden ${ratioClass}`}
          style={useIntrinsicAspect && videoAspectRatio ? { aspectRatio: videoAspectRatio } : undefined}
        >
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            playsInline
            loop={loop}
            muted={muted}
            poster={poster}
            autoPlay={autoPlay}
            controls
            controlsList="nodownload"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          >
            {src ? <source src={src} /> : null}
          </video>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_18px_55px_rgba(0,0,0,0.45)] ${isFullscreen && isIdle ? "cursor-none" : "cursor-default"} ${className}`}
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
          controls={false}
          controlsList="nodownload"
        >
          {src ? <source src={src} /> : null}
        </video>

        {!usesNativeControls ? (
          <button
            type="button"
            onClick={togglePlay}
            className={`pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity ${
              shouldShowCenterButton ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-md bg-black/70 text-white shadow-[0_10px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors hover:bg-black/85">
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </span>
          </button>
        ) : null}

        {!usesNativeControls ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-3 pt-14 transition-opacity duration-200 md:px-4 md:pb-4 ${
              shouldShowControls ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="pointer-events-auto text-xs text-white">
              <div className="relative mb-2 h-4">
                <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded bg-white/25">
                  <div
                    className="h-full rounded bg-[#ff0033]"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={progress}
                  aria-label="Seek"
                  onChange={handleSeek}
                  className="absolute inset-0 h-4 w-full cursor-pointer appearance-none bg-transparent accent-[#ff0033] opacity-0"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className={controlButtonClass}
                    aria-label={isPlaying ? "Pause video" : "Play video"}
                  >
                    {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="ml-0.5 h-4.5 w-4.5" />}
                  </button>

                  <div
                    className="flex items-center gap-1.5"
                    onMouseEnter={() => setIsVolumeHovering(true)}
                    onMouseLeave={() => setIsVolumeHovering(false)}
                  >
                    <button
                      type="button"
                      onClick={toggleMute}
                      className={controlButtonClass}
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted || volume === 0 ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="h-1 w-16 cursor-pointer accent-white md:w-20"
                      aria-label="Volume"
                    />
                  </div>

                  <div className="ml-1 whitespace-nowrap text-[12px] tabular-nums text-white/85">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                {allowFullscreen ? (
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className={controlButtonClass}
                    aria-label="Toggle fullscreen"
                    aria-pressed={isFullscreen}
                  >
                    <Maximize2 className="h-4.5 w-4.5" />
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
