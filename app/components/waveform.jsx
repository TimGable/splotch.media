"use client";

import { useEffect, useMemo, useState } from "react";

const waveformCache = new Map();

async function loadWaveformPeaks(audioUrl, sampleCount) {
  const cacheKey = `${audioUrl}::${sampleCount}`;
  const cached = waveformCache.get(cacheKey);
  if (cached) {
    return cached instanceof Promise ? cached : Promise.resolve(cached);
  }

  const pending = (async () => {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error("Failed to load audio for waveform.");
    }

    const arrayBuffer = await response.arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is unavailable.");
    }

    const audioContext = new AudioContextClass();

    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
      const peaks = [];

      for (let index = 0; index < sampleCount; index += 1) {
        const start = index * blockSize;
        const end = Math.min(channelData.length, start + blockSize);
        let peak = 0;

        for (let cursor = start; cursor < end; cursor += 1) {
          const amplitude = Math.abs(channelData[cursor] || 0);
          if (amplitude > peak) {
            peak = amplitude;
          }
        }

        peaks.push(peak);
      }

      const maxPeak = Math.max(...peaks, 0.0001);
      const normalizedPeaks = peaks.map((peak) =>
        Math.max(8, Math.min(100, Math.round((peak / maxPeak) * 100))),
      );

      waveformCache.set(cacheKey, normalizedPeaks);
      return normalizedPeaks;
    } finally {
      await audioContext.close().catch(() => {});
    }
  })().catch((error) => {
    waveformCache.delete(cacheKey);
    throw error;
  });

  waveformCache.set(cacheKey, pending);
  return pending;
}

export function Waveform({
  data,
  audioUrl,
  isPlaying,
  height = 40,
  progress = 0,
  currentTime = 0,
  duration = 0,
  onSeek,
  seekLabel,
  disabled = false,
}) {
  const [resolvedData, setResolvedData] = useState(data || []);
  const bars = useMemo(() => data || [], [data]);
  const barWidth = 2;
  const gap = 1;
  const activeData = resolvedData.length > 0 ? resolvedData : bars;
  const totalWidth = Math.max(activeData.length * (barWidth + gap), 1);
  const isSeekDisabled = disabled || !onSeek || !duration;

  useEffect(() => {
    let cancelled = false;

    if (!audioUrl) {
      setResolvedData(bars);
      return () => {
        cancelled = true;
      };
    }

    setResolvedData(bars);

    loadWaveformPeaks(audioUrl, bars.length > 0 ? bars.length : 96)
      .then((nextData) => {
        if (!cancelled) {
          setResolvedData(nextData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedData(bars);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl, bars]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: `${height}px` }}
      data-playing={isPlaying ? "true" : "false"}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
      >
        {activeData.map((value, index) => {
          const barHeight = (value / 100) * height;
          const y = (height - barHeight) / 2;
          const x = index * (barWidth + gap);
          const isPlayed = progress > 0 && (x / totalWidth) <= progress;

          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={isPlayed ? "white" : "rgba(255, 255, 255, 0.3)"}
            />
          );
        })}
      </svg>

      {onSeek && (
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={currentTime}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={isSeekDisabled}
          aria-label={seekLabel || "Seek track"}
        />
      )}
    </div>
  );
}
