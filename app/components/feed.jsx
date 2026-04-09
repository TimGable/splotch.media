import { AnimatePresence, motion } from "motion/react";
import { Heart, Image as ImageIcon, MessageCircle, Video as VideoIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ArchiveLoadingState } from "./archive-loading-state";
import { MusicReleasePlayer } from "./music-release-player";
import { ShareLinkButton } from "./share-link-button";
import { buildPublicMediaPath } from "@/lib/media-slugs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PAGE_TRANSITION,
  CONTENT_SWAP_ANIMATION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
  SOFT_CARD_HOVER,
} from "@/lib/motion";

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(value).toLocaleDateString();
}

function getArtistLabel(artist) {
  return artist?.displayName || artist?.username || "artist";
}

function getPreviewKindIcon(mediaKind) {
  if (mediaKind === "visual") {
    return <ImageIcon className="h-4 w-4" />;
  }

  if (mediaKind === "video") {
    return <VideoIcon className="h-4 w-4" />;
  }

  return null;
}

export function Feed({
  onArtistClick,
  onPlayTrack,
  onAddToQueue,
  onOpenProfile,
  onOpenItem,
  currentTrackId,
  isPlaying,
  currentTime,
  duration,
  onSeekTrack,
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [feedItems, setFeedItems] = useState([]);
  const [feedSource, setFeedSource] = useState("following");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(12);
  const [loadError, setLoadError] = useState("");
  const [likeItemId, setLikeItemId] = useState("");

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatUploadDate = (value) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString();
  };

  const formatReleaseType = (value) => {
    if (value === "ep") return "EP";
    if (value === "album") return "Album";
    return "Single";
  };

  useEffect(() => {
    let mounted = true;

    async function loadFeed() {
      const startedAt = Date.now();
      setIsLoading(true);
      setLoadingProgress(12);
      setLoadError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (!session?.access_token) {
          setFeedItems([]);
          setLoadError("Session expired. Please sign in again.");
          setLoadingProgress(100);
          setIsLoading(false);
          return;
        }

        setLoadingProgress(28);

        const response = await fetch("/api/feed", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!mounted) {
          return;
        }

        setLoadingProgress(72);

        const payload = await response.json().catch(() => ({}));
        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setFeedItems([]);
          setLoadError(payload?.error || "Failed to load your feed.");
          setLoadingProgress(100);
          setIsLoading(false);
          return;
        }

        setFeedItems(Array.isArray(payload?.items) ? payload.items : []);
        setFeedSource(payload?.source === "discovery" ? "discovery" : "following");
        setLoadingProgress(100);

        const elapsed = Date.now() - startedAt;
        const minLoadDuration = 520;
        if (elapsed < minLoadDuration) {
          await new Promise((resolve) => setTimeout(resolve, minLoadDuration - elapsed));
        }

        if (!mounted) {
          return;
        }

        setIsLoading(false);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setFeedItems([]);
        setLoadError(error instanceof Error ? error.message : "Failed to load your feed.");
        setLoadingProgress(100);
        setIsLoading(false);
      }
    }

    loadFeed();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadFeed();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const getShareUrl = (item) => {
    if (typeof window === "undefined") {
      return buildPublicMediaPath(item.artist.username, item.slug);
    }

    return `${window.location.origin}${buildPublicMediaPath(item.artist.username, item.slug)}`;
  };

  const handleToggleLike = async (itemId) => {
    setLikeItemId(itemId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch(`/api/media/${itemId}/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "toggle-like" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return;
      }

      setFeedItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                likes: payload?.likeCount ?? item.likes,
                comments: payload?.commentCount ?? item.comments,
                isLiked: Boolean(payload?.isLiked),
              }
            : item,
        ),
      );
    } finally {
      setLikeItemId("");
    }
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isLoading ? (
        <motion.div
          key="feed-loading"
          {...CONTENT_SWAP_ANIMATION}
          transition={PAGE_TRANSITION}
        >
          <ArchiveLoadingState
            className="max-w-5xl"
            label="home feed"
            progress={loadingProgress}
          />
        </motion.div>
      ) : loadError ? (
        <motion.div
          key="feed-error"
          className="mx-auto max-w-5xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400"
          {...CONTENT_SWAP_ANIMATION}
          transition={PAGE_TRANSITION}
        >
          {loadError}
        </motion.div>
      ) : feedItems.length === 0 ? (
        <motion.div
          key="feed-empty"
          className="mx-auto max-w-5xl"
          {...CONTENT_SWAP_ANIMATION}
          transition={PAGE_TRANSITION}
        >
          <div className="text-center">
            <h3 className="text-2xl md:text-3xl">your feed is quiet</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-400 md:text-base">
              Follow artists and publish your own work to populate this space.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <motion.button
                type="button"
                onClick={onOpenProfile}
                className="border border-white/15 px-5 py-3 text-sm tracking-wide text-gray-300 transition-colors hover:border-white/40 hover:bg-white/10 hover:text-white"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                open my profile
              </motion.button>
            </div>
          </div>
        </motion.div>
      ) : (
      <motion.div
        key="feed-content"
        className="mx-auto max-w-5xl space-y-6 md:space-y-8"
        {...CONTENT_SWAP_ANIMATION}
        transition={PAGE_TRANSITION}
      >
      {feedSource === "discovery" ? (
        <div className="border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-300">
          discovery mix
          <span className="ml-2 text-gray-500">
            you are not following anyone yet, so the feed is pulling a rotating selection from across the archive.
          </span>
        </div>
      ) : null}

      {feedItems.map((item, index) => {
        const artistLabel = getArtistLabel(item.artist);
        const isActiveTrack = item.mediaKind === "music" && currentTrackId === item.id;
        const previewUrl =
          item.mediaKind === "music"
            ? item.coverAsset?.url || ""
            : item.asset?.url || "";

        return (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...PAGE_TRANSITION, delay: index * 0.05 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-4 px-1">
              <motion.button
                type="button"
                className="flex min-w-0 items-center gap-3 text-left"
                onClick={() => onArtistClick?.(item.artist)}
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/5">
                  {item.artist?.avatarUrl ? (
                    <img
                      src={item.artist.avatarUrl}
                      alt={artistLabel}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm uppercase text-gray-400">
                      {artistLabel.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white transition-colors hover:text-gray-300">
                    {artistLabel}
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-500">
                    {formatRelativeTime(item.publishedAt || item.createdAt)}
                  </p>
                </div>
              </motion.button>
            </div>

            {item.mediaKind === "music" ? (
              <>
                <MusicReleasePlayer
                  item={item}
                  isActive={isActiveTrack}
                  isPlaying={Boolean(isActiveTrack && isPlaying)}
                  onOpen={() => onOpenItem?.(item)}
                  onPlayPause={() => onPlayTrack?.(item, feedItems)}
                  onAddToQueue={() => onAddToQueue?.(item, feedItems)}
                  onShare={getShareUrl}
                  onToggleLike={() => handleToggleLike(item.id)}
                  onOpenComments={() => onOpenItem?.(item)}
                  isLikePending={likeItemId === item.id}
                  currentTime={isActiveTrack ? currentTime : 0}
                  duration={isActiveTrack ? duration : 0}
                  onSeek={isActiveTrack ? onSeekTrack : undefined}
                  formatFileSize={formatFileSize}
                  formatUploadDate={formatUploadDate}
                  formatReleaseType={formatReleaseType}
                />
              </>
            ) : (
              <div className="overflow-hidden border border-white/20 bg-white/5 transition-colors hover:border-white/35">
                <div className="p-4 md:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-gray-300">
                      {getPreviewKindIcon(item.mediaKind)}
                      <span>{item.mediaKind}</span>
                    </span>
                  </div>

                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <motion.button
                        type="button"
                        onClick={() => onOpenItem?.(item)}
                        className="cursor-pointer text-left text-xl transition-colors hover:text-gray-300"
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        {item.title}
                      </motion.button>
                      {item.description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mx-auto w-full max-w-[16rem] sm:max-w-[18rem]">
                    <motion.button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="group block w-full cursor-pointer overflow-hidden border border-white/10 bg-black text-left transition-colors hover:border-white/30"
                      whileHover={SOFT_CARD_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      {item.mediaKind === "video" ? (
                        item.asset?.url ? (
                          <video
                            muted
                            playsInline
                            preload="metadata"
                            className="aspect-square w-full bg-black object-cover object-center"
                          >
                            <source src={item.asset.url} type={item.asset.mimeType} />
                          </video>
                        ) : (
                          <div className="aspect-square w-full bg-white/5" />
                        )
                      ) : previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={item.title}
                          className="aspect-square w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-white/5">
                          <ImageIcon className="h-10 w-10 text-white/30" />
                        </div>
                      )}
                    </motion.button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-sm text-gray-400">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(item.id)}
                      disabled={likeItemId === item.id}
                      className={`inline-flex items-center gap-2 transition-colors ${
                        item.isLiked ? "text-white" : "hover:text-white"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <Heart className={`h-4 w-4 ${item.isLiked ? "fill-white text-white" : ""}`} />
                      <span>{item.likes || 0}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="inline-flex items-center gap-2 transition-colors hover:text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>{item.comments || 0}</span>
                    </button>

                    <ShareLinkButton
                      url={getShareUrl(item)}
                      className="inline-flex items-center gap-2 transition-colors hover:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.article>
        );
      })}
      </motion.div>
      )}
    </AnimatePresence>
  );
}
