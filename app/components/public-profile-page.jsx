"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { ArchiveLoadingState } from "./archive-loading-state";
import { VisualGalleryLightbox } from "./visual-gallery-lightbox";
import { usePublicAudio } from "./public-audio-context";
import { ProfileArchiveView } from "./profile-archive-view";
import { ProfileConnectionsModal } from "./profile-connections-modal";
import { LikedTracksPanel } from "./liked-tracks-panel";
import { MyProfile } from "./my-profile";
import { buildPublicMediaPath } from "@/lib/media-slugs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearPublicReturnTarget, getPublicReturnTarget } from "@/lib/public-navigation";
import { CONTENT_SWAP_ANIMATION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, PAGE_TRANSITION } from "@/lib/motion";

const PROFILE_BACK_NAV_DELAY_MS = 260;

function createProfileQueueEntry(item, artist) {
  return {
    track: {
      id: item.id,
      title: item.title,
      audioUrl: item.asset.url,
      slug: item.slug || "",
    },
    release: {
      id: item.id,
      title: item.title,
      coverArt: item.coverAsset?.url || "",
    },
    artist: {
      name: artist?.name || "artist",
      username: artist?.username || "",
    },
  };
}

export function PublicProfilePage({ profile, items, likedTracks = [] }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [isResolvingViewer, setIsResolvingViewer] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(profile.followerCount || 0);
  const [followingCount, setFollowingCount] = useState(profile.followingCount || 0);
  const [canFollow, setCanFollow] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [lightboxState, setLightboxState] = useState({ kind: "", index: -1 });
  const [connectionsView, setConnectionsView] = useState(null);
  const noticeTimeoutRef = useRef(null);
  const {
    currentTrack,
    playbackQueue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    playTrack,
    addTrackToQueue,
    seekTrack,
    setCurrentTrack,
    setPlaybackQueue,
    setQueueIndex,
    setIsPlaying,
    setCurrentTime,
    setDuration,
  } = usePublicAudio();

  const musicItems = useMemo(
    () => items.filter((item) => item.mediaKind === "music" && item.asset?.url),
    [items],
  );
  const visualItems = useMemo(
    () => items.filter((item) => item.mediaKind === "visual"),
    [items],
  );
  const videoItems = useMemo(
    () => items.filter((item) => item.mediaKind === "video"),
    [items],
  );
  const lightboxItems = lightboxState.kind === "video" ? videoItems : visualItems;

  const openMediaItem = (item) => {
    router.push(buildPublicMediaPath(profile.username, item.slug));
  };

  const showNotice = (type, message) => {
    setNotice({ type, message });
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice({ type: "", message: "" });
    }, 2400);
  };

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadFollowState() {
      setIsResolvingViewer(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (!session?.access_token) {
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) {
          return;
        }

        if (!user?.id) {
          return;
        }

        const profileResponse = await fetch("/api/profile", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const profilePayload = await profileResponse.json().catch(() => ({}));
        const isOwnProfile = profilePayload?.profile?.userId === profile.userId;
        setIsOwnProfile(isOwnProfile);
        setCanFollow(!isOwnProfile);

        if (isOwnProfile) {
          return;
        }

        const response = await fetch(`/api/follows/${profile.userId}`, {
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
      } finally {
        if (mounted) {
          setIsResolvingViewer(false);
        }
      }
    }

    loadFollowState();
    return () => {
      mounted = false;
    };
  }, [profile.userId, supabase]);

  const handlePlayTrack = (item) => {
    playTrack(item, profile, musicItems);
  };

  const handleAddToQueue = (item) => {
    const result = addTrackToQueue(item, profile, musicItems);
    if (result === "exists") {
      showNotice("error", "Track already in queue.");
      return;
    }

    if (result === "added") {
      showNotice("success", "Track added to queue.");
    }
  };

  const handleShare = (item) => {
    if (typeof window === "undefined") {
      return buildPublicMediaPath(profile.username, item.slug);
    }

    return `${window.location.origin}${buildPublicMediaPath(profile.username, item.slug)}`;
  };

  const navigateBackWithTransition = (target) => {
    if (isNavigatingBack) {
      return;
    }

    setIsNavigatingBack(true);
    window.setTimeout(() => {
      router.push(target);
    }, PROFILE_BACK_NAV_DELAY_MS);
  };

  const handleBack = () => {
    const target = getPublicReturnTarget();
    clearPublicReturnTarget();
    navigateBackWithTransition(target);
  };

  const handleOwnerBack = () => {
    const target = getPublicReturnTarget();
    clearPublicReturnTarget();
    navigateBackWithTransition(target || "/");
  };

  const handleFollowToggle = async () => {
    setIsUpdatingFollow(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showNotice("error", "Sign in to follow artists.");
        return;
      }

      const response = await fetch(`/api/follows/${profile.userId}`, {
        method: isFollowing ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        showNotice("error", payload?.error || "Failed to update follow state.");
        return;
      }

      setIsFollowing(Boolean(payload?.isFollowing));
      setFollowerCount(Number(payload?.followerCount || 0));
      setFollowingCount(Number(payload?.followingCount || 0));
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  const openVisualLightbox = (itemId) => {
    const nextIndex = visualItems.findIndex((item) => item.id === itemId);
    if (nextIndex !== -1) {
      setLightboxState({ kind: "visual", index: nextIndex });
    }
  };

  const openVideoLightbox = (itemId) => {
    const nextIndex = videoItems.findIndex((item) => item.id === itemId);
    if (nextIndex !== -1) {
      setLightboxState({ kind: "video", index: nextIndex });
    }
  };

  const handleOwnerPlayTrack = (item, artist, queueItems) => {
    if (!item?.asset?.url) {
      return;
    }

    if (currentTrack?.track?.id === item.id) {
      setIsPlaying((current) => !current);
      return;
    }

    const queue = (queueItems || [])
      .filter((queueItem) => queueItem?.asset?.url)
      .map((queueItem) => createProfileQueueEntry(queueItem, artist));

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

  const handleOwnerAddTrackToQueue = (item, artist, queueItems) => {
    if (!item?.asset?.url) {
      return "invalid";
    }

    const nextEntry = createProfileQueueEntry(item, artist);

    if (!currentTrack) {
      setPlaybackQueue([nextEntry]);
      setQueueIndex(0);
      setCurrentTrack(nextEntry);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return "added";
    }

    const queueSource = playbackQueue.length > 0
      ? playbackQueue
      : (queueItems || [])
          .filter((queueItem) => queueItem?.asset?.url)
          .map((queueItem) => createProfileQueueEntry(queueItem, artist));

    if (queueSource.some((entry) => entry.track.id === item.id)) {
      return "exists";
    }

    setPlaybackQueue([...queueSource, nextEntry]);
    return "added";
  };

  const handleOwnerDeletedTrack = (mediaItemId) => {
    const removedIndex = playbackQueue.findIndex((entry) => entry.track.id === mediaItemId);
    const nextQueue = playbackQueue.filter((entry) => entry.track.id !== mediaItemId);

    setPlaybackQueue(nextQueue);

    if (currentTrack?.track?.id === mediaItemId) {
      setIsPlaying(false);
      setCurrentTrack(null);
      setQueueIndex(-1);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (removedIndex !== -1 && removedIndex < queueIndex) {
      setQueueIndex((currentIndex) => Math.max(0, currentIndex - 1));
      return;
    }

    if (nextQueue.length === 0) {
      setQueueIndex(-1);
    }
  };

  const handleOwnerMediaItemUpdated = (item) => {
    if (!item?.id) {
      return;
    }

    setPlaybackQueue((currentQueue) =>
      currentQueue.map((entry) =>
        entry.track.id === item.id
          ? {
              ...entry,
              track: {
                ...entry.track,
                title: item.title,
                audioUrl: item.asset?.url || entry.track.audioUrl,
              },
              release: {
                ...entry.release,
                title: item.title,
                coverArt: item.coverAsset?.url || entry.release.coverArt,
              },
            }
          : entry,
      ),
    );

    setCurrentTrack((current) => {
      if (current?.track?.id !== item.id) {
        return current;
      }

      return {
        ...current,
        track: {
          ...current.track,
          title: item.title,
          audioUrl: item.asset?.url || current.track.audioUrl,
        },
        release: {
          ...current.release,
          title: item.title,
          coverArt: item.coverAsset?.url || current.release.coverArt,
        },
      };
    });
  };

  return (
    <motion.div
      className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12"
      animate={
        isNavigatingBack
          ? { opacity: 0, y: -16, scale: 0.992, filter: "blur(8px)" }
          : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
      }
      transition={PAGE_TRANSITION}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isResolvingViewer ? (
          <motion.div
            key="public-profile-loading"
            {...CONTENT_SWAP_ANIMATION}
            transition={PAGE_TRANSITION}
          >
            <ArchiveLoadingState
              className="max-w-5xl"
              label="profile"
              progress={42}
            />
          </motion.div>
        ) : isOwnProfile ? (
          <motion.div
            key="public-profile-owner"
            {...CONTENT_SWAP_ANIMATION}
            transition={PAGE_TRANSITION}
          >
            <MyProfile
              onBack={handleOwnerBack}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlayTrack={handleOwnerPlayTrack}
              onAddTrackToQueue={handleOwnerAddTrackToQueue}
              onTrackDeleted={handleOwnerDeletedTrack}
              onMediaItemUpdated={handleOwnerMediaItemUpdated}
              currentTime={currentTime}
              duration={duration}
              onSeekTrack={(nextTime) => seekTrack(nextTime)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="public-profile-content"
            {...CONTENT_SWAP_ANIMATION}
            transition={PAGE_TRANSITION}
          >
            <motion.button
              type="button"
              onClick={handleBack}
              disabled={isNavigatingBack}
              className="mb-6 text-gray-400 transition-colors hover:text-white md:mb-8"
              whileHover={{ x: -3, ...SOFT_BUTTON_HOVER }}
              whileTap={SOFT_BUTTON_TAP}
              transition={PAGE_TRANSITION}
            >
              <span aria-hidden="true">{"\u2190"}</span>
              <span className="ml-2">back</span>
            </motion.button>

            <ProfileArchiveView
              profile={{
                ...profile,
                followerCount,
                followingCount,
              }}
              items={items}
              headerLabel="profile"
              contentHeading="archive"
              contentNotice={notice}
              currentTrackId={currentTrack?.track?.id || null}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onOpenItem={openMediaItem}
              onPlayTrack={handlePlayTrack}
              onSeekTrack={(item, nextTime) => {
                if (currentTrack?.track?.id !== item.id) {
                  return;
                }
                seekTrack(nextTime);
              }}
              onAddToQueue={handleAddToQueue}
              onShare={handleShare}
              onOpenVisual={(item) => openVisualLightbox(item.id)}
              onOpenVideo={(item) => openVideoLightbox(item.id)}
              onOpenConnections={(view) => setConnectionsView(view)}
              canFollow={canFollow}
              isFollowing={isFollowing}
              isUpdatingFollow={isUpdatingFollow}
              onFollowToggle={handleFollowToggle}
              headerBottomRight={
                <LikedTracksPanel
                  likedTracks={likedTracks}
                  onOpenTrack={(track) =>
                    router.push(buildPublicMediaPath(track.artist.username, track.slug))
                  }
                />
              }
            />

            <VisualGalleryLightbox
              profile={profile}
              items={lightboxItems}
              currentIndex={lightboxState.index}
              onClose={() => setLightboxState({ kind: "", index: -1 })}
              onPrevious={() =>
                setLightboxState((current) => ({
                  ...current,
                  index:
                    lightboxItems.length > 0
                      ? (current.index - 1 + lightboxItems.length) % lightboxItems.length
                      : -1,
                }))
              }
              onNext={() =>
                setLightboxState((current) => ({
                  ...current,
                  index: lightboxItems.length > 0 ? (current.index + 1) % lightboxItems.length : -1,
                }))
              }
            />

            {connectionsView ? (
              <ProfileConnectionsModal
                username={profile.username}
                displayName={profile.displayName}
                initialView={connectionsView}
                onClose={() => setConnectionsView(null)}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
