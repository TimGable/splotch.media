"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GlobalAudioPlayer } from "./global-audio-player";

const PublicAudioContext = createContext(null);

function isMultiTrackReleaseItem(item) {
  return item?.mediaKind === "music" && item?.collectionId && item?.releaseType !== "single";
}

function getReleaseTitle(item) {
  return isMultiTrackReleaseItem(item) ? item.collectionTitle || item.title : item.title;
}

function createQueueEntry(item, profile) {
  return {
    track: {
      id: item.id,
      title: item.title,
      audioUrl: item.asset?.url || "",
      slug: item.slug || "",
    },
    release: {
      id: item.collectionId || item.id,
      title: getReleaseTitle(item),
      coverArt: item.coverAsset?.url || "",
    },
    artist: {
      name: profile?.displayName || profile?.username || "artist",
      username: profile?.username || "",
    },
  };
}

export function PublicAudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playbackQueue, setPlaybackQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayerClosing, setIsPlayerClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  const cancelScheduledClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const resetPlayer = () => {
    setCurrentTrack(null);
    setPlaybackQueue([]);
    setQueueIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlayerClosing(false);
  };

  useEffect(() => () => cancelScheduledClose(), []);

  const playTrack = (item, profile, queueItems = []) => {
    if (!item?.asset?.url) {
      return;
    }

    cancelScheduledClose();
    setIsPlayerClosing(false);

    if (currentTrack?.track?.id === item.id) {
      setIsPlaying((current) => !current);
      return;
    }

    const queue = queueItems
      .filter((queueItem) => queueItem?.mediaKind === "music" && queueItem?.asset?.url)
      .map((queueItem) => createQueueEntry(queueItem, profile));

    const nextQueueIndex = queue.findIndex((entry) => entry.track.id === item.id);
    if (nextQueueIndex === -1) {
      return;
    }

    setPlaybackQueue(queue);
    setQueueIndex(nextQueueIndex);
    setCurrentTrack(queue[nextQueueIndex] || null);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  };

  const addTrackToQueue = (item, profile, queueItems = []) => {
    if (!item?.asset?.url) {
      return "invalid";
    }

    cancelScheduledClose();
    setIsPlayerClosing(false);

    const nextEntry = createQueueEntry(item, profile);

    if (!currentTrack) {
      setPlaybackQueue([nextEntry]);
      setQueueIndex(0);
      setCurrentTrack(nextEntry);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return "added";
    }

    const queueSource =
      playbackQueue.length > 0
        ? playbackQueue
        : queueItems
            .filter((queueItem) => queueItem?.mediaKind === "music" && queueItem?.asset?.url)
            .map((queueItem) => createQueueEntry(queueItem, profile));

    if (queueSource.some((entry) => entry.track.id === item.id)) {
      return "exists";
    }

    setPlaybackQueue([
      ...(queueSource.length > 0 ? queueSource : currentTrack ? [currentTrack] : []),
      nextEntry,
    ]);
    return "added";
  };

  const closePlayer = () => {
    if (!currentTrack || isPlayerClosing) {
      return;
    }

    cancelScheduledClose();
    setIsPlayerClosing(true);
    setIsPlaying(false);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      resetPlayer();
    }, 260);
  };

  const seekTrack = (time, audioElement) => {
    setCurrentTime(time);
    if (audioElement) {
      audioElement.currentTime = time;
    }
  };

  const skipTrack = (direction) => {
    cancelScheduledClose();
    setIsPlayerClosing(false);

    const nextIndex = queueIndex + direction;
    if (nextIndex < 0 || nextIndex >= playbackQueue.length) {
      return;
    }

    setQueueIndex(nextIndex);
    setCurrentTrack(playbackQueue[nextIndex]);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  };

  const selectQueueIndex = (nextIndex) => {
    cancelScheduledClose();
    setIsPlayerClosing(false);

    if (nextIndex < 0 || nextIndex >= playbackQueue.length) {
      return;
    }

    setQueueIndex(nextIndex);
    setCurrentTrack(playbackQueue[nextIndex]);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  };

  const moveQueueItem = (fromIndex, toIndex) => {
    if (
      fromIndex < 0 ||
      fromIndex >= playbackQueue.length ||
      toIndex < 0 ||
      toIndex >= playbackQueue.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const nextQueue = [...playbackQueue];
    const [movedEntry] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, movedEntry);

    setPlaybackQueue(nextQueue);

    if (queueIndex === fromIndex) {
      setQueueIndex(toIndex);
      setCurrentTrack(nextQueue[toIndex] || null);
      return;
    }

    if (fromIndex < queueIndex && toIndex >= queueIndex) {
      setQueueIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (fromIndex > queueIndex && toIndex <= queueIndex) {
      setQueueIndex((current) => current + 1);
    }
  };

  const removeQueueItem = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= playbackQueue.length) {
      return;
    }

    const nextQueue = playbackQueue.filter((_, index) => index !== targetIndex);

    if (targetIndex === queueIndex) {
      if (nextQueue.length === 0) {
        closePlayer();
        return;
      }

      const nextIndex = Math.min(targetIndex, nextQueue.length - 1);
      setPlaybackQueue(nextQueue);
      setQueueIndex(nextIndex);
      setCurrentTrack(nextQueue[nextIndex] || null);
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    setPlaybackQueue(nextQueue);

    if (targetIndex < queueIndex) {
      setQueueIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (nextQueue.length === 0) {
      setQueueIndex(-1);
    }
  };

  const value = useMemo(
    () => ({
      currentTrack,
      playbackQueue,
      queueIndex,
      isPlayerClosing,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
      playTrack,
      addTrackToQueue,
      closePlayer,
      seekTrack,
      skipTrack,
      selectQueueIndex,
      moveQueueItem,
      removeQueueItem,
      setCurrentTrack,
      setPlaybackQueue,
      setQueueIndex,
      setIsPlaying,
      setCurrentTime,
      setDuration,
      setVolume,
      setIsMuted,
    }),
    [
      currentTrack,
      playbackQueue,
      queueIndex,
      isPlayerClosing,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
      selectQueueIndex,
      moveQueueItem,
      removeQueueItem,
    ],
  );

  return (
    <PublicAudioContext.Provider value={value}>
      {children}

      {currentTrack ? (
        <GlobalAudioPlayer
          currentTrack={currentTrack}
          playbackQueue={playbackQueue}
          queueIndex={queueIndex}
          isClosing={isPlayerClosing}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          onPlayPause={() => setIsPlaying((current) => !current)}
          onTrackEnd={() => {
            if (queueIndex >= 0 && queueIndex < playbackQueue.length - 1) {
              skipTrack(1);
              return;
            }

            setIsPlaying(false);
            setCurrentTime(0);
          }}
          canSkipPrevious={queueIndex > 0}
          canSkipNext={queueIndex >= 0 && queueIndex < playbackQueue.length - 1}
          onSkipPrevious={() => skipTrack(-1)}
          onSkipNext={() => skipTrack(1)}
          onQueueSelect={selectQueueIndex}
          onQueueMove={moveQueueItem}
          onQueueRemove={removeQueueItem}
          onClose={closePlayer}
          onTimeChange={setCurrentTime}
          onDurationChange={setDuration}
          onSeek={seekTrack}
          onVolumeChange={(nextVolume) => {
            setVolume(nextVolume);
            if (nextVolume > 0) {
              setIsMuted(false);
            }
          }}
          onMuteToggle={() => setIsMuted((current) => !current)}
        />
      ) : null}
    </PublicAudioContext.Provider>
  );
}

export function usePublicAudio() {
  const context = useContext(PublicAudioContext);
  if (!context) {
    throw new Error("usePublicAudio must be used within a PublicAudioProvider.");
  }

  return context;
}
