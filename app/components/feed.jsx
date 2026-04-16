import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Ellipsis, Heart, Image as ImageIcon, MessageCircle, Share2, Video as VideoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveLoadingState } from "./archive-loading-state";
import { MusicReleasePlayer } from "./music-release-player";
import { MultiTrackReleaseCard } from "./multi-track-release-card";
import { MentionText } from "./mention-text";
import { VideoPlayer } from "./video-player";
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
  };
}

function buildFeedEntries(items) {
  const entries = [];
  const releasesByCollectionId = new Map();

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
  const [feedItems, setFeedItems] = useState([]);
  const [feedSource, setFeedSource] = useState("following");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(12);
  const [loadError, setLoadError] = useState("");
  const [likeItemId, setLikeItemId] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState("");
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
        className="mx-auto max-w-5xl space-y-6 md:space-y-8"
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
            : item.asset?.url || "";

        return (
          <motion.article
            key={entry.id}
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
              entry.kind === "release" ? (
                <MultiTrackReleaseCard
                  release={entry.release}
                  activeTrackId={currentTrackId}
                  isPlaying={isPlaying}
                  onOpen={(track) => onOpenItem?.(track)}
                  onPlayTrack={(track, releaseTracks) => onPlayTrack?.(track, releaseTracks || feedItems)}
                  onAddTrackToQueue={(track) => onAddToQueue?.(track, feedItems)}
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
                <div className="p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-gray-300">
                      {getPreviewKindIcon(item.mediaKind)}
                      <span>{item.mediaKind}</span>
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
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
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenItem?.(item)}
                            className="group block w-full overflow-hidden border border-white/10 bg-black text-left md:hidden"
                            aria-label={`Open ${item.title}`}
                          >
                            <div className="relative aspect-[4/5] w-full">
                              {item.coverAsset?.url ? (
                                <img
                                  src={item.coverAsset.url}
                                  alt={item.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                                  <VideoIcon className="h-12 w-12 text-white/30" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-black/65 text-white backdrop-blur-sm">
                                  <VideoIcon className="h-6 w-6" />
                                </span>
                              </div>
                            </div>
                          </button>

                          <div className="hidden md:block">
                            <VideoPlayer
                              src={item.asset.url}
                              poster={item.coverAsset?.url || ""}
                              className="w-full border border-white/10"
                              ratioClass="aspect-video"
                              muted
                              allowFullscreen
                            />
                          </div>
                        </>
                      ) : (
                        <div className="aspect-[4/5] w-full border border-white/10 bg-white/5 sm:aspect-video" />
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
                    )}
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                      <span>Uploaded {formatUploadDate(item.createdAt)}</span>
                      {item.asset?.fileName ? <span>{item.asset.fileName}</span> : null}
                      {item.asset?.fileSizeBytes ? <span>{formatFileSize(item.asset.fileSizeBytes)}</span> : null}
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
      </motion.div>
      )}
    </AnimatePresence>
  );
}
