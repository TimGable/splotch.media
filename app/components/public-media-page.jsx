"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { Edit2, ListPlus, Music2, Pause, Play, Palette, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { Waveform } from "./waveform";
import { usePublicAudio } from "./public-audio-context";
import { MediaSocialPanel } from "./media-social-panel";
import { VisualGalleryLightbox } from "./visual-gallery-lightbox";
import { EditUploadModal } from "./edit-upload-modal";
import { MentionText } from "./mention-text";
import { VideoPlayer } from "./video-player";
import { ShareLinkButton } from "./share-link-button";
import { FadeInImage } from "./fade-in-image";
import { buildPublicMediaPath, buildPublicProfilePath } from "@/lib/media-slugs";
import { createSupabaseBrowserClient, getStoredSupabaseUserId } from "@/lib/supabase/client";

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function createSeededRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 4294967296;
  };
}

function buildWaveformData(seedSource) {
  const random = createSeededRandom(hashString(seedSource));
  return Array.from({ length: 96 }, (_, index) => {
    const base = 20 + random() * 62;
    const shaped = index % 11 === 0 ? base * 0.72 : base;
    return Math.max(10, Math.min(95, Math.round(shaped)));
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatReleaseType(value) {
  if (value === "ep") return "EP";
  if (value === "album") return "Album";
  return "Single";
}

function formatUploadDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortReleaseTracks(a, b) {
  const firstTrackNumber = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const secondTrackNumber = b.trackNumber ?? Number.MAX_SAFE_INTEGER;

  if (firstTrackNumber !== secondTrackNumber) {
    return firstTrackNumber - secondTrackNumber;
  }

  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

function isMultiTrackReleaseItem(item) {
  return item?.mediaKind === "music" && item?.collectionId && item?.releaseType !== "single";
}

function getMediaDisplayTitle(item) {
  return isMultiTrackReleaseItem(item) ? item.collectionTitle || item.title : item.title;
}

function cleanReleaseDescription(description) {
  return String(description || "").replace(/^From (EP|Album) ".*?"\.\s*/i, "").trim();
}

function getRelatedItemIcon(mediaKind, className = "h-5 w-5") {
  if (mediaKind === "visual") {
    return <Palette className={className} />;
  }

  if (mediaKind === "video") {
    return <Video className={className} />;
  }

  return <Music2 className={className} />;
}

function getRelatedItemPreviewUrl(item) {
  if (item.coverAsset?.url) {
    return item.coverAsset.url;
  }

  if (item.mediaKind === "visual" && (item.previewAsset?.url || item.asset?.url)) {
    return item.previewAsset?.url || item.asset.url;
  }

  return "";
}

function buildRelatedItems(items, currentItem) {
  const currentReleaseCollectionId = isMultiTrackReleaseItem(currentItem)
    ? currentItem.collectionId
    : null;
  const seenReleaseCollectionIds = new Set();
  const relatedItems = [];

  for (const entry of items) {
    if (entry.id === currentItem.id) {
      continue;
    }

    if (isMultiTrackReleaseItem(entry)) {
      if (entry.collectionId === currentReleaseCollectionId || seenReleaseCollectionIds.has(entry.collectionId)) {
        continue;
      }

      seenReleaseCollectionIds.add(entry.collectionId);
      relatedItems.push(entry);
      continue;
    }

    relatedItems.push(entry);
  }

  return relatedItems.slice(0, 4);
}

export function PublicMediaPage({ profile, item, publicItems }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playTrack,
    addTrackToQueue,
    seekTrack,
  } = usePublicAudio();
  const [displayedItem, setDisplayedItem] = useState(item);
  const [displayedPublicItems, setDisplayedPublicItems] = useState(publicItems);
  const [isOwnerView, setIsOwnerView] = useState(
    () => Boolean(profile.authUserId) && getStoredSupabaseUserId() === profile.authUserId,
  );
  const [editingMediaItem, setEditingMediaItem] = useState(null);
  const [isUpdatingMedia, setIsUpdatingMedia] = useState(false);
  const [deletingMediaItemId, setDeletingMediaItemId] = useState(null);
  const waveformData = useMemo(
    () => buildWaveformData(`${displayedItem.id}:${displayedItem.asset?.fileName || displayedItem.title}`),
    [displayedItem.asset?.fileName, displayedItem.id, displayedItem.title],
  );
  const isActiveTrack = currentTrack?.track?.id === displayedItem.id;
  const displayedCurrentTime = isActiveTrack ? currentTime : 0;
  const displayedDuration = isActiveTrack ? duration : 0;
  const progress = displayedDuration > 0 ? displayedCurrentTime / displayedDuration : 0;
  const relatedItems = useMemo(
    () => buildRelatedItems(displayedPublicItems, displayedItem),
    [displayedItem, displayedPublicItems],
  );
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const isMusic = displayedItem.mediaKind === "music";
  const displayTitle = getMediaDisplayTitle(displayedItem);
  const displayDescription = cleanReleaseDescription(displayedItem.description);
  const sharePath = buildPublicMediaPath(profile.username, displayedItem.slug);
  const shareUrl =
    typeof window === "undefined" ? sharePath : `${window.location.origin}${sharePath}`;
  const collectionTracks = useMemo(() => {
    if (
      displayedItem.mediaKind !== "music" ||
      !displayedItem.collectionId ||
      displayedItem.releaseType === "single"
    ) {
      return [];
    }

    const tracksById = new Map();
    tracksById.set(displayedItem.id, displayedItem);
    for (const entry of displayedPublicItems) {
      if (entry.collectionId === displayedItem.collectionId && entry.mediaKind === "music") {
        tracksById.set(entry.id, entry);
      }
    }

    return [...tracksById.values()].sort(sortReleaseTracks);
  }, [displayedItem, displayedPublicItems]);
  const isMultiTrackRelease = collectionTracks.length > 1;
  const openEditModal = () => {
    const isMultiTrackRelease =
      displayedItem.mediaKind === "music" &&
      displayedItem.collectionId &&
      displayedItem.releaseType &&
      displayedItem.releaseType !== "single" &&
      collectionTracks.length > 0;

    setEditingMediaItem(
      isMultiTrackRelease ? { ...displayedItem, releaseTracks: collectionTracks } : displayedItem,
    );
  };
  useEffect(() => {
    if (
      !editingMediaItem ||
      editingMediaItem.releaseType === "single" ||
      !editingMediaItem.collectionId ||
      collectionTracks.length === 0 ||
      editingMediaItem.collectionId !== displayedItem.collectionId
    ) {
      return;
    }

    const currentIds = (editingMediaItem.releaseTracks || []).map((track) => track.id).join(",");
    const nextIds = collectionTracks.map((track) => track.id).join(",");

    if (currentIds !== nextIds) {
      setEditingMediaItem((current) =>
        current ? { ...current, releaseTracks: collectionTracks } : current,
      );
    }
  }, [collectionTracks, displayedItem.collectionId, editingMediaItem]);
  const musicItems =
    displayedItem.mediaKind === "music" && displayedItem.asset?.url
      ? collectionTracks.length > 1
        ? collectionTracks
        : [
          displayedItem,
          ...displayedPublicItems.filter(
            (entry) => entry.id !== displayedItem.id && entry.mediaKind === "music" && entry.asset?.url,
          ),
        ]
      : displayedPublicItems.filter((entry) => entry.mediaKind === "music" && entry.asset?.url);
  const galleryItems = useMemo(() => {
    if (displayedItem.mediaKind !== "visual" && displayedItem.mediaKind !== "video") {
      return [];
    }

    return [
      displayedItem,
      ...displayedPublicItems.filter(
        (entry) => entry.id !== displayedItem.id && entry.mediaKind === displayedItem.mediaKind,
      ),
    ];
  }, [displayedItem, displayedPublicItems]);

  useEffect(() => {
    setDisplayedItem(item);
  }, [item]);

  useEffect(() => {
    setDisplayedPublicItems(publicItems);
  }, [publicItems]);

  useEffect(() => {
    let mounted = true;

    const syncOwnerState = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setIsOwnerView(false);
        return;
      }

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!mounted) {
        return;
      }

      const nextIsOwnerView = payload?.profile?.userId === profile.userId || Boolean(payload?.profile?.isAdmin);
      setIsOwnerView((current) => (current === nextIsOwnerView ? current : nextIsOwnerView));
    };

    syncOwnerState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setIsOwnerView(false);
        return;
      }

      fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
        .then((response) => response.json().catch(() => ({})))
        .then((payload) => {
          if (!mounted) {
            return;
          }

          const nextIsOwnerView = payload?.profile?.userId === profile.userId || Boolean(payload?.profile?.isAdmin);
          setIsOwnerView((current) => (current === nextIsOwnerView ? current : nextIsOwnerView));
        })
        .catch(() => {
          if (!mounted) {
            return;
          }

          setIsOwnerView(false);
        });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [profile.userId, supabase]);

  const openGallery = () => {
    if (galleryItems.length > 0) {
      setLightboxIndex(0);
    }
  };

  const handlePlayPause = async () => {
    playTrack(displayedItem, profile, musicItems);
  };

  const handlePlayReleaseTrack = (track) => {
    playTrack(track, profile, musicItems);
  };

  const handleSeek = (nextTime) => {
    seekTrack(nextTime);
  };

  const handleAddToQueue = () => {
    addTrackToQueue(displayedItem, profile, musicItems);
  };

  const handleAddReleaseTrackToQueue = (track) => {
    addTrackToQueue(track, profile, musicItems);
  };

  const handleSaveMediaItem = async ({ id, title, description, visibility, coverArt }) => {
    setIsUpdatingMedia(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const body = new FormData();
      body.append("id", id);
      body.append("title", title);
      body.append("description", description);
      body.append("visibility", visibility);
      if (coverArt instanceof File) {
        body.append("coverArt", coverArt);
      }

      const response = await fetch("/api/media", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.item) {
        return;
      }

      const mergedItem = {
        ...displayedItem,
        ...payload.item,
        likes: displayedItem.likes || 0,
        comments: displayedItem.comments || 0,
        isLiked: Boolean(displayedItem.isLiked),
      };

      setDisplayedItem(mergedItem);
      setDisplayedPublicItems((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...payload.item,
                likes: entry.likes || 0,
                comments: entry.comments || 0,
                isLiked: Boolean(entry.isLiked),
              }
            : entry,
        ),
      );
      setEditingMediaItem(null);

      if (visibility !== "public" && visibility !== "unlisted") {
        router.push(buildPublicProfilePath(profile.username));
      }
    } finally {
      setIsUpdatingMedia(false);
    }
  };

  const handleDeleteMediaItem = async (mediaItemId, options = {}) => {
    setDeletingMediaItemId(mediaItemId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return false;
      }

      const deleteUrl = `/api/media?id=${encodeURIComponent(mediaItemId)}${
        options.scope === "release" ? "&scope=release" : ""
      }`;
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      setEditingMediaItem(null);
      router.push(buildPublicProfilePath(profile.username));
      return true;
    } finally {
      setDeletingMediaItemId(null);
    }
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(buildPublicProfilePath(profile.username));
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-12">
      <div className="mb-6 border border-white/20 bg-black/35 p-4 md:mb-10 md:p-8">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:mb-8 md:flex-row md:items-start md:justify-between md:gap-4 md:pb-6">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="mb-3 inline-block text-sm text-gray-400 transition-colors hover:text-white md:mb-4"
            >
              <span aria-hidden="true">{"\u2190"}</span>
              <span className="ml-2">back</span>
            </button>
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 md:mb-3 md:text-[11px] md:tracking-[0.22em]">
              {displayedItem.mediaKind === "music"
                ? "music release"
                : displayedItem.mediaKind === "visual"
                  ? "visual piece"
                  : "video release"}
            </p>
            <h1 className="max-w-4xl text-2xl leading-tight md:text-5xl">{displayTitle}</h1>
            <Link
              href={buildPublicProfilePath(profile.username)}
              className="mt-3 inline-block text-sm text-gray-400 transition-colors hover:text-white md:mt-4"
            >
              by {profile.displayName}
            </Link>
            {displayDescription && (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400 md:mt-4 md:text-base">
                <MentionText text={displayDescription} />
              </p>
            )}
          </div>

          <div className="flex flex-row flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-gray-500 md:flex-col md:items-end md:text-right">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-col md:items-end">
              <p>{displayedItem.visibility.replace("_", " ")}</p>
              <p className="md:mt-2">{formatUploadDate(displayedItem.publishedAt || displayedItem.createdAt)}</p>
            </div>
            <ShareLinkButton
              url={shareUrl}
              label="share post"
              className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-white/40 hover:text-white md:mt-4"
            />
            {isOwnerView ? (
              <button
                type="button"
                onClick={openEditModal}
                className="mt-4 inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
              >
                <Edit2 className="h-4 w-4" />
                <span>edit post</span>
              </button>
            ) : null}
          </div>
        </div>

        {isMusic && (
          <div className="mx-auto mb-4 flex max-w-5xl justify-center md:mb-6">
            <div className="w-full max-w-[18rem] shrink-0 md:max-w-sm">
              <div className="aspect-square w-full overflow-hidden border border-white/10 bg-black">
                {displayedItem.coverAsset?.url ? (
                  <FadeInImage
                    src={displayedItem.coverAsset.url}
                    alt={displayTitle}
                    className="h-full w-full object-cover"
                    containerClassName="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
                    <Music2 className="h-16 w-16 text-white/35" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={isMusic ? "mx-auto max-w-5xl" : ""}>
          <div className="overflow-hidden border border-white/10 bg-white/[0.03]">
            {isMusic && (
              <div className="p-5 md:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-300">
                        {formatReleaseType(displayedItem.releaseType)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddToQueue}
                      className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                    >
                      <ListPlus className="h-4 w-4" />
                      <span>add to queue</span>
                    </button>
                  </div>

                  {!isMultiTrackRelease ? (
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      disabled={!displayedItem.asset?.url}
                      className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] transition-colors hover:border-white/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPlaying && isActiveTrack ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="relative mb-2 overflow-hidden border border-white/10 bg-white/[0.02] px-3 py-3">
                      <Waveform
                        data={waveformData}
                        audioUrl={displayedItem.asset?.url}
                        isPlaying={isPlaying && isActiveTrack}
                        height={52}
                        progress={progress}
                        currentTime={displayedCurrentTime}
                        duration={displayedDuration}
                        onSeek={handleSeek}
                        seekLabel={`Seek ${displayTitle}`}
                      />
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-gray-500">
                        <span>{displayedCurrentTime > 0 ? formatTime(displayedCurrentTime) : ""}</span>
                        <span>{displayedDuration > 0 ? formatTime(displayedDuration) : displayedItem.asset?.mimeType?.replace("/", " / ") || "audio"}</span>
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {isMultiTrackRelease ? (
                    <div className="mt-6 border-t border-white/10 pt-4">
                      <div className="mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-gray-500">
                        <span>{collectionTracks.length} tracks</span>
                        <span>{displayTitle}</span>
                      </div>

                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 archive-scrollbar-thin">
                        {collectionTracks.map((track, index) => {
                          const isReleaseTrackActive = currentTrack?.track?.id === track.id;
                          const isReleaseTrackPlaying = isReleaseTrackActive && isPlaying;
                          const releaseTrackDuration = isReleaseTrackActive ? duration : 0;
                          const releaseTrackCurrentTime = isReleaseTrackActive ? currentTime : 0;
                          const releaseTrackProgress =
                            releaseTrackDuration > 0 ? releaseTrackCurrentTime / releaseTrackDuration : 0;
                          const releaseTrackWaveformData = buildWaveformData(
                            `${track.id}:${track.asset?.fileName || track.title}`,
                          );

                          return (
                          <div
                              key={track.id}
                              className="grid grid-cols-[2.25rem_minmax(0,1fr)_1.5rem] items-center gap-2.5 border border-white/10 bg-black/20 px-2.5 py-2 md:px-3"
                            >
                              <button
                                type="button"
                                onClick={() => handlePlayReleaseTrack(track)}
                                disabled={!track.asset?.url}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] transition-colors hover:border-white/45 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`${isReleaseTrackPlaying ? "Pause" : "Play"} ${track.title}`}
                              >
                                {isReleaseTrackPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                              </button>

                              <div className="min-w-0">
                                <Link
                                  href={buildPublicMediaPath(profile.username, track.slug)}
                                  className="transition-colors hover:text-gray-300"
                                >
                                  <span className="block truncate text-sm">
                                    {track.trackNumber || index + 1}. {track.title}
                                  </span>
                                </Link>
                                <div className="mt-1 overflow-hidden border border-white/10 bg-white/[0.02] px-2 py-1">
                                  <Waveform
                                    data={releaseTrackWaveformData}
                                    audioUrl={track.asset?.url}
                                    isPlaying={isReleaseTrackPlaying}
                                    height={20}
                                    progress={releaseTrackProgress}
                                    currentTime={releaseTrackCurrentTime}
                                    duration={releaseTrackDuration}
                                    onSeek={isReleaseTrackActive ? handleSeek : undefined}
                                    seekLabel={`Seek ${track.title}`}
                                    disabled={!isReleaseTrackActive}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end text-gray-500">
                                <button
                                  type="button"
                                  onClick={() => handleAddReleaseTrackToQueue(track)}
                                  disabled={!track.asset?.url}
                                  className="inline-flex items-center gap-1 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`Add ${track.title} to queue`}
                                >
                                  <ListPlus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
            )}

            {!isMusic && displayedItem.mediaKind === "visual" && (
              <div className="flex justify-center p-4 md:p-8">
                <button
                  type="button"
                  onClick={openGallery}
                  className="inline-flex max-w-full cursor-pointer justify-center text-left"
                >
                  {displayedItem.asset?.url ? (
                    <FadeInImage
                      src={displayedItem.asset.url}
                      alt={displayTitle}
                      className="h-auto max-h-[78vh] max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex min-h-[20rem] items-center justify-center">
                      <Palette className="h-16 w-16 text-white/25" />
                    </div>
                  )}
                </button>
              </div>
            )}

            {!isMusic && displayedItem.mediaKind === "video" && (
              <div className="flex justify-center p-3 sm:p-5 md:p-8">
                {displayedItem.asset?.url ? (
                  <VideoPlayer
                    src={displayedItem.asset.url}
                    poster={displayedItem.coverAsset?.url || ""}
                    className="w-full max-w-[22rem] sm:max-w-[34rem] md:max-w-[42rem]"
                    ratioClass="aspect-[4/5] sm:aspect-video"
                    useIntrinsicAspect={false}
                    allowFullscreen
                  />
                ) : (
                  <div className="flex aspect-[4/5] w-full max-w-[22rem] items-center justify-center border border-white/10 bg-black sm:aspect-video sm:max-w-[34rem] md:max-w-[42rem]">
                    <Video className="h-16 w-16 text-white/25" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-10">
        <MediaSocialPanel
          mediaItemId={displayedItem.id}
          initialLikeCount={displayedItem.likes || 0}
          initialCommentCount={displayedItem.comments || 0}
          initialIsLiked={displayedItem.isLiked || false}
        />
      </div>

      {relatedItems.length > 0 && (
        <div>
          <h2 className="mb-6 text-xl">more from @{profile.username}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {relatedItems.map((relatedItem) => {
              const previewUrl = getRelatedItemPreviewUrl(relatedItem);

              return (
                <Link
                  key={relatedItem.id}
                  href={buildPublicMediaPath(profile.username, relatedItem.slug)}
                  className="group block cursor-pointer border border-white/20 bg-white/5 p-4 transition-colors hover:border-white/40 hover:bg-white/[0.08]"
                >
                  <div className="relative mb-3 aspect-square overflow-hidden border border-white/10 bg-black">
                    {previewUrl ? (
                      <FadeInImage
                        src={previewUrl}
                        alt={getMediaDisplayTitle(relatedItem)}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        containerClassName="h-full w-full"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/60">
                        {getRelatedItemIcon(relatedItem.mediaKind, "h-10 w-10")}
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center border border-white/15 bg-black/75 text-white/80 backdrop-blur-sm">
                      {getRelatedItemIcon(relatedItem.mediaKind)}
                    </div>
                  </div>
                  <h3 className="text-sm transition-colors group-hover:text-gray-200">
                    {getMediaDisplayTitle(relatedItem)}
                  </h3>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <VisualGalleryLightbox
        profile={profile}
        items={galleryItems}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onPrevious={() =>
          setLightboxIndex((current) =>
            galleryItems.length > 0 ? (current - 1 + galleryItems.length) % galleryItems.length : -1,
          )
        }
        onNext={() =>
          setLightboxIndex((current) =>
            galleryItems.length > 0 ? (current + 1) % galleryItems.length : -1,
          )
        }
      />

      <AnimatePresence>
        {isOwnerView && editingMediaItem ? (
          <EditUploadModal
            item={editingMediaItem}
            releaseTracks={editingMediaItem?.releaseTracks || null}
            isSubmitting={isUpdatingMedia}
            isDeleting={deletingMediaItemId === editingMediaItem.id}
            onClose={() => setEditingMediaItem(null)}
            onSave={handleSaveMediaItem}
            onDelete={handleDeleteMediaItem}
            onDeleteTrack={handleDeleteMediaItem}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
