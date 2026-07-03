import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Ellipsis, Heart, Image as ImageIcon, MessageCircle, Share2, Video as VideoIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveLoadingState } from "./archive-loading-state";
import { MusicReleasePlayer } from "./music-release-player";
import { MultiTrackReleaseCard } from "./multi-track-release-card";
import { MentionText } from "./mention-text";
import { VideoPlayer } from "./video-player";
import { FadeInImage } from "./fade-in-image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { buildPublicMediaPath } from "@/lib/media-slugs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PAGE_TRANSITION,
  CONTENT_SWAP_ANIMATION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
  SOFT_CARD_HOVER,
} from "@/lib/motion";

const FEED_PAGE_SIZE = 5;

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

function isMultiTrackReleaseItem(item) {
  return item.mediaKind === "music" && item.collectionId && item.releaseType && item.releaseType !== "single";
}

function cleanReleaseDescription(description) {
  return String(description || "").replace(/^From (EP|Album) ".*?"\.\s*/i, "");
}

function sortReleaseTracks(a, b) {
  const firstTrackNumber = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const secondTrackNumber = b.trackNumber ?? Number.MAX_SAFE_INTEGER;

  if (firstTrackNumber !== secondTrackNumber) {
    return firstTrackNumber - secondTrackNumber;
  }

  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

function buildReleaseSummary(group) {
  const tracks = [...group.tracks].sort(sortReleaseTracks);
  const firstTrack = tracks[0];

  return {
    id: group.collectionId,
    collectionId: group.collectionId,
    title: firstTrack?.collectionTitle || firstTrack?.title || "untitled release",
    description: cleanReleaseDescription(firstTrack?.description),
    releaseType: firstTrack?.releaseType,
    visibility: firstTrack?.visibility,
    coverAsset: tracks.find((track) => track.coverAsset?.url)?.coverAsset || null,
    createdAt: firstTrack?.publishedAt || firstTrack?.createdAt,
    tracks,
    likes: tracks.reduce((total, track) => total + (track.likes || 0), 0),
    comments: tracks.reduce((total, track) => total + (track.comments || 0), 0),
    isLiked: tracks.some((track) => Boolean(track.isLiked)),
  };
}

function buildFeedEntries(items) {
  const entries = [];
  const releasesByCollectionId = new Map();

  // Feed rows arrive as tracks, but albums and EPs read better when grouped into one release card.
  for (const item of items) {
    if (!isMultiTrackReleaseItem(item)) {
      entries.push({ kind: "single", id: item.id, item });
      continue;
    }

    let releaseGroup = releasesByCollectionId.get(item.collectionId);
    if (!releaseGroup) {
      releaseGroup = {
        collectionId: item.collectionId,
        tracks: [],
      };
      releasesByCollectionId.set(item.collectionId, releaseGroup);
      entries.push({ kind: "release", id: item.collectionId, releaseGroup });
    }

    releaseGroup.tracks.push(item);
  }

  return entries.map((entry) =>
    entry.kind === "release"
      ? { kind: "release", id: entry.id, release: buildReleaseSummary(entry.releaseGroup) }
      : entry,
  );
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
  const copiedShareTimeoutRef = useRef(null);
  const feedLoadRequestRef = useRef(0);
  const loadMoreTriggerRef = useRef(null);
  const hasMoreFeedItemsRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const nextFeedOffsetRef = useRef(0);
  const [feedItems, setFeedItems] = useState([]);
  const [feedSource, setFeedSource] = useState("following");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(12);
  const [loadError, setLoadError] = useState("");
  const [likeItemId, setLikeItemId] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState("");
  const [hasMoreFeedItems, setHasMoreFeedItems] = useState(false);
  const feedEntries = useMemo(() => buildFeedEntries(feedItems), [feedItems]);

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
    return () => {
      if (copiedShareTimeoutRef.current) {
        window.clearTimeout(copiedShareTimeoutRef.current);
      }
    };
  }, []);

  const loadFeed = useCallback(
    async ({ reset = false } = {}) => {
      const startedAt = Date.now();
      const offset = reset ? 0 : nextFeedOffsetRef.current;

      if (reset) {
        setIsLoading(true);
        setLoadingProgress(12);
        hasMoreFeedItemsRef.current = false;
        nextFeedOffsetRef.current = 0;
        setHasMoreFeedItems(false);
      } else {
        if (isLoadingMoreRef.current || !hasMoreFeedItemsRef.current) {
          return;
        }
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
      }

      const requestId = feedLoadRequestRef.current + 1;
      feedLoadRequestRef.current = requestId;
      setLoadError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Ignore stale responses when auth changes or a newer feed request starts before this one finishes.
        if (feedLoadRequestRef.current !== requestId) {
          return;
        }

        if (!session?.access_token) {
          if (reset) {
            setFeedItems([]);
          }
          setLoadError("Session expired. Please sign in again.");
          setLoadingProgress(100);
          setIsLoading(false);
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
          return;
        }

        if (reset) {
          setLoadingProgress(28);
        }

        const response = await fetch(`/api/feed?limit=${FEED_PAGE_SIZE}&offset=${offset}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (feedLoadRequestRef.current !== requestId) {
          return;
        }

        if (reset) {
          setLoadingProgress(72);
        }

        const payload = await response.json().catch(() => ({}));
        if (feedLoadRequestRef.current !== requestId) {
          return;
        }

        if (!response.ok) {
          if (reset) {
            setFeedItems([]);
          }
          setLoadError(payload?.error || "Failed to load your feed.");
          setLoadingProgress(100);
          setIsLoading(false);
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
          return;
        }

        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setFeedItems((currentItems) => {
          if (reset) {
            return nextItems;
          }

          const existingIds = new Set(currentItems.map((item) => item.id));
          return [...currentItems, ...nextItems.filter((item) => !existingIds.has(item.id))];
        });
        setFeedSource(payload?.source === "discovery" ? "discovery" : "following");
        hasMoreFeedItemsRef.current = Boolean(payload?.hasMore);
        nextFeedOffsetRef.current = Number.isFinite(payload?.nextOffset)
          ? payload.nextOffset
          : offset + nextItems.length;
        setHasMoreFeedItems(Boolean(payload?.hasMore));

        if (reset) {
          setLoadingProgress(100);
        }

        const elapsed = Date.now() - startedAt;
        const minLoadDuration = reset ? 520 : 420;
        if (elapsed < minLoadDuration) {
          await new Promise((resolve) => setTimeout(resolve, minLoadDuration - elapsed));
        }

        if (feedLoadRequestRef.current !== requestId) {
          return;
        }

        if (reset) {
          setIsLoading(false);
        } else {
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        }
      } catch (error) {
        if (feedLoadRequestRef.current !== requestId) {
          return;
        }

        if (reset) {
          setFeedItems([]);
        }
        setLoadError(error instanceof Error ? error.message : "Failed to load your feed.");
        setLoadingProgress(100);
        setIsLoading(false);
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    let mounted = true;

    const loadInitialFeed = () => {
      if (!mounted) {
        return;
      }
      loadFeed({ reset: true });
    };

    loadInitialFeed();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadInitialFeed();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadFeed, supabase]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || isLoading || !hasMoreFeedItems) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadFeed();
        }
      },
      { rootMargin: "360px 0px" },
    );

    // Start loading before the sentinel is visible so the feed feels continuous while scrolling.
    observer.observe(trigger);

    return () => observer.disconnect();
  }, [hasMoreFeedItems, isLoading, loadFeed]);

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

  const handleCopyShareUrl = async (itemId, url) => {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareUrl(itemId);
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
        className="mx-auto max-w-5xl space-y-5 md:space-y-8"
        {...CONTENT_SWAP_ANIMATION}
        transition={PAGE_TRANSITION}
      >
      {feedSource === "discovery" ? (
        <div className="border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-300">
          discovery mix
          <span className="ml-2 text-gray-500">
            you are not following anyone yet, so the feed is pulling a rotating selection from across the website.
          </span>
        </div>
      ) : null}

      {feedEntries.map((entry, index) => {
        const item = entry.kind === "release" ? entry.release.tracks[0] : entry.item;
        const artistLabel = getArtistLabel(item.artist);
        const isActiveTrack = item.mediaKind === "music" && currentTrackId === item.id;
        const previewUrl =
          item.mediaKind === "music"
            ? item.coverAsset?.url || ""
            : item.previewAsset?.url || item.asset?.url || "";

        return (
          <motion.article
            key={entry.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...PAGE_TRANSITION, delay: index * 0.05 }}
            className="space-y-3.5 md:space-y-4"
          >
            <div className="flex items-center gap-3 px-1 md:gap-4">
              <motion.button
                type="button"
                className="flex min-w-0 items-center gap-3 text-left"
                onClick={() => onArtistClick?.(item.artist)}
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/5 md:h-11 md:w-11">
                  {item.artist?.avatarUrl ? (
                    <FadeInImage
                      src={item.artist.avatarUrl}
                      alt={artistLabel}
                      className="h-full w-full object-cover"
                      containerClassName="h-full w-full"
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
              entry.kind === "release" ? (
                <MultiTrackReleaseCard
                  release={entry.release}
                  activeTrackId={currentTrackId}
                  isPlaying={isPlaying}
                  onOpen={(track) => onOpenItem?.(track)}
                  onPlayTrack={(track, releaseTracks) => onPlayTrack?.(track, releaseTracks || feedItems)}
                  onAddTrackToQueue={(track) => onAddToQueue?.(track, feedItems)}
                  onToggleLike={(track) => handleToggleLike(track.id)}
                  isLikePending={entry.release.tracks.some((track) => likeItemId === track.id)}
                  onShare={getShareUrl}
                  onOpenComments={(track) => onOpenItem?.(track)}
                  formatFileSize={formatFileSize}
                  formatUploadDate={formatUploadDate}
                  maxTrackListHeight="max-h-44"
                />
              ) : (
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
              )
            ) : (
              <div className="overflow-hidden border border-white/20 bg-white/5 transition-colors hover:border-white/35">
                <div className="p-3.5 md:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3 md:mb-4">
                    <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300 md:gap-2 md:px-2.5 md:text-[11px] md:tracking-[0.18em]">
                      {getPreviewKindIcon(item.mediaKind)}
                      <span>{item.mediaKind}</span>
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white md:h-10 md:w-10"
                          aria-label={`Open post options for ${item.title}`}
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
                            <span>share post</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-[min(24rem,calc(100vw-3rem))] border-white/15 bg-black text-white">
                            <div className="space-y-3 p-2">
                              <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">post url</p>
                              <div className="border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-gray-300">
                                <span className="break-all">{getShareUrl(item)}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyShareUrl(item.id, getShareUrl(item))}
                                className="inline-flex w-full items-center justify-center gap-2 border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                              >
                                {copiedShareUrl === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                <span>{copiedShareUrl === item.id ? "copied" : "copy link"}</span>
                              </button>
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mb-3 flex items-start justify-between gap-3 md:mb-4 md:gap-4">
                    <div className="min-w-0">
                      <motion.button
                        type="button"
                        onClick={() => onOpenItem?.(item)}
                        className="cursor-pointer text-left text-base transition-colors hover:text-gray-300 md:text-xl"
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        {item.title}
                      </motion.button>
                      {item.description ? (
                        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-400 md:mt-2">
                          <MentionText text={item.description} />
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={
                      item.mediaKind === "video"
                        ? "mx-auto w-full max-w-[22rem] md:max-w-[42rem]"
                        : "mx-auto w-full max-w-[16rem] sm:max-w-[18rem]"
                    }
                  >
                    {item.mediaKind === "video" ? (
                      item.asset?.url ? (
                        <VideoPlayer
                          src={item.asset.url}
                          poster={item.coverAsset?.url || ""}
                          className="w-full border border-white/10"
                          ratioClass="aspect-video"
                          useIntrinsicAspect={false}
                          muted
                          allowFullscreen
                        />
                      ) : (
                        <div className="aspect-video w-full border border-white/10 bg-white/5" />
                      )
                    ) : (
                      <motion.button
                        type="button"
                        onClick={() => onOpenItem?.(item)}
                        className="group block w-full cursor-pointer overflow-hidden border border-white/10 bg-black text-left transition-colors hover:border-white/30"
                        whileHover={SOFT_CARD_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        {previewUrl ? (
                          <FadeInImage
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
                    )}
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3 md:mt-4 md:pt-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                      <span>Uploaded {formatUploadDate(item.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleLike(item.id)}
                        disabled={likeItemId === item.id}
                        className={`inline-flex items-center gap-1.5 transition-colors ${
                          item.isLiked ? "text-white" : "hover:text-white"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${item.isLiked ? "fill-white text-white" : ""}`} />
                        <span>{item.likes || 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenItem?.(item)}
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>{item.comments || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.article>
        );
      })}
      <div ref={loadMoreTriggerRef} className="h-10" aria-hidden="true" />
      <AnimatePresence initial={false}>
        {isLoadingMore ? (
          <motion.div
            key="feed-load-more"
            className="flex justify-center pb-2 pt-1"
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.94 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="h-7 w-7 rounded-full border border-white/15 border-t-white/80"
              style={{ animation: "archive-feed-spin 820ms linear infinite" }}
              aria-label="loading more posts"
              role="status"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
