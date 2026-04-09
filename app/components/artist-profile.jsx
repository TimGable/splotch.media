import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { Waveform } from "./waveform";
import { ImageWithFallback } from "./figma/ImageWithFallback.tsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildPublicProfilePath } from "@/lib/media-slugs";

function formatTrackCount(count) {
  return count === 1 ? "1 track" : `${count} tracks`;
}

export function ArtistProfile({
  artist,
  onBack,
  onPlayTrack,
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onSeekTrack,
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [expandedRelease, setExpandedRelease] = useState(null);
  const [isFollowing, setIsFollowing] = useState(artist.isFollowing || false);
  const [followerCount, setFollowerCount] = useState(artist.followerCount || 0);
  const [followingCount, setFollowingCount] = useState(artist.followingCount || 0);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadFollowState() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch(`/api/follows/${artist.id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok || !mounted) {
        return;
      }

      const payload = await response.json().catch(() => ({}));
      if (!mounted) {
        return;
      }

      setIsFollowing(Boolean(payload?.isFollowing));
      setFollowerCount(Number(payload?.followerCount || 0));
      setFollowingCount(Number(payload?.followingCount || 0));
    }

    loadFollowState();
    return () => {
      mounted = false;
    };
  }, [artist.id, supabase]);

  const handleFollowToggle = () => {
    async function toggleFollow() {
      setIsUpdatingFollow(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          return;
        }

        const response = await fetch(`/api/follows/${artist.id}`, {
          method: isFollowing ? "DELETE" : "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json().catch(() => ({}));
        setIsFollowing(Boolean(payload?.isFollowing));
        setFollowerCount(Number(payload?.followerCount || 0));
        setFollowingCount(Number(payload?.followingCount || 0));
      } finally {
        setIsUpdatingFollow(false);
      }
    }

    toggleFollow();
  };

  const openPublicProfile = () => {
    if (typeof window === "undefined" || !artist?.username) {
      return;
    }

    window.location.assign(buildPublicProfilePath(artist.username));
  };

  const isTrackPlaying = (trackId) => currentTrack?.track?.id === trackId && isPlaying;

  const handleTrackClick = (track, release) => {
    onPlayTrack(track, release, artist);
  };

  const handleTrackSeek = (trackId, nextTime) => {
    if (currentTrack?.track?.id !== trackId || !onSeekTrack) {
      return;
    }

    onSeekTrack(nextTime);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.button
        onClick={onBack}
        className="group relative mb-6 inline-block text-gray-400 transition-colors hover:text-white md:mb-8"
        whileHover={{ x: -5 }}
        whileTap={{ scale: 0.95 }}
      >
        <span aria-hidden="true">{"\u2190"}</span>
        <span className="ml-2">back</span>
        <motion.div
          className="absolute -bottom-1 left-0 h-px bg-white"
          initial={{ width: 0 }}
          whileHover={{ width: "100%" }}
          transition={{ duration: 0.25 }}
        />
      </motion.button>

      <div className="mb-12 border border-white/20 p-6 md:p-10">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <motion.div
            className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-br from-gray-800 to-gray-900 md:h-44 md:w-44"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.45 }}
          >
            <ImageWithFallback
              src={artist.avatar}
              alt={artist.name}
              className="h-full w-full object-cover"
            />
          </motion.div>

          <motion.div
            className="min-w-0 flex-1"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.45 }}
          >
            <div className="mb-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">
                  artist profile
                </p>
                <h1 className="text-3xl md:text-5xl">{artist.name}</h1>
                {artist.username && (
                  <p className="mt-2 text-sm text-gray-400 md:text-base">@{artist.username}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <motion.button
                  type="button"
                  onClick={openPublicProfile}
                  className="inline-flex items-center gap-2 border border-white/25 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:border-white/45 hover:bg-white/[0.05] hover:text-white"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>open public page</span>
                  <ArrowUpRight className="h-4 w-4" />
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleFollowToggle}
                  className={`border px-5 py-2.5 text-sm transition-colors ${
                    isFollowing
                      ? "border-white/40 bg-white text-black hover:bg-white/90"
                      : "border-white/30 bg-transparent text-white hover:border-white/50 hover:bg-white/[0.05]"
                  }`}
                  disabled={isUpdatingFollow}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isFollowing ? "unfollow" : "follow"}
                </motion.button>
              </div>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="border border-white/15 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">followers</p>
                <p className="mt-2 text-2xl">{followerCount}</p>
              </div>
              <div className="border border-white/15 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">following</p>
                <p className="mt-2 text-2xl">{followingCount}</p>
              </div>
              <div className="border border-white/15 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">releases</p>
                <p className="mt-2 text-2xl">{artist.releases.length}</p>
              </div>
            </div>

            <p className="max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base">
              {artist.bio || "No bio added yet."}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-gray-500">discography</p>
          <h2 className="text-2xl md:text-3xl">releases</h2>
        </div>
        <p className="text-sm text-gray-500">
          Open a release to view tracks and scrub through the live waveform.
        </p>
      </div>

      {artist.releases.length === 0 ? (
        <div className="border border-dashed border-white/20 p-12 text-center text-gray-500">
          no releases yet
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {artist.releases.map((release, index) => {
            const isExpanded = expandedRelease === release.id;

            return (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index, duration: 0.35 }}
                className="overflow-hidden border border-white/20 bg-white/[0.03]"
              >
                <div className="flex flex-col md:flex-row">
                  <div className="aspect-square w-full overflow-hidden border-b border-white/10 bg-black md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r">
                    <ImageWithFallback
                      src={release.coverArt}
                      alt={release.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <span className="border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-300">
                        {release.type}
                      </span>
                      <span className="border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">
                        {formatTrackCount(release.tracks.length)}
                      </span>
                    </div>

                    <h3 className="text-2xl">{release.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-400">
                      {release.description || "No description added for this release yet."}
                    </p>

                    <motion.button
                      type="button"
                      onClick={() => setExpandedRelease(isExpanded ? null : release.id)}
                      className="mt-6 inline-flex items-center gap-2 self-start border border-white/20 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/40 hover:bg-white/[0.05] hover:text-white"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {isExpanded ? "hide tracks" : "view tracks"}
                    </motion.button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden border-t border-white/10"
                    >
                      <div className="space-y-3 p-4 md:p-5">
                        {release.tracks.map((track, trackIndex) => {
                          const isActiveTrack = currentTrack?.track?.id === track.id;

                          return (
                            <motion.div
                              key={track.id}
                              initial={{ x: -10, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: trackIndex * 0.04 }}
                              className="border border-white/10 bg-white/[0.02] p-3"
                            >
                              <div className="flex items-start gap-3">
                                <motion.button
                                  type="button"
                                  onClick={() => handleTrackClick(track, release)}
                                  className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center border border-white/20 transition-colors hover:border-white/50 hover:bg-white/[0.08]"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {isTrackPlaying(track.id) ? (
                                    <Pause className="h-4 w-4" />
                                  ) : (
                                    <Play className="ml-0.5 h-4 w-4" />
                                  )}
                                </motion.button>

                                <div className="min-w-0 flex-1">
                                  <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="truncate text-sm md:text-base">{track.title}</span>
                                    <span className="flex-shrink-0 text-xs uppercase tracking-[0.16em] text-gray-500">
                                      {track.duration}
                                    </span>
                                  </div>

                                  <Waveform
                                    data={track.waveformData}
                                    audioUrl={track.audioUrl}
                                    isPlaying={isTrackPlaying(track.id)}
                                    height={34}
                                    progress={isActiveTrack && duration > 0 ? currentTime / duration : 0}
                                    currentTime={isActiveTrack ? currentTime : 0}
                                    duration={isActiveTrack ? duration : 0}
                                    onSeek={
                                      isActiveTrack
                                        ? (nextTime) => handleTrackSeek(track.id, nextTime)
                                        : undefined
                                    }
                                    seekLabel={`Seek ${track.title}`}
                                    disabled={!isActiveTrack}
                                  />
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
