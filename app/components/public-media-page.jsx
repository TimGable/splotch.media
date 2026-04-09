"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit2, ListPlus, Music2, Pause, Play, Palette, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { Waveform } from "./waveform";
import { usePublicAudio } from "./public-audio-context";
import { MediaSocialPanel } from "./media-social-panel";
import { VisualGalleryLightbox } from "./visual-gallery-lightbox";
import { EditUploadModal } from "./edit-upload-modal";
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
  const relatedItems = displayedPublicItems.filter((entry) => entry.id !== displayedItem.id).slice(0, 4);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const musicItems =
    displayedItem.mediaKind === "music" && displayedItem.asset?.url
      ? [
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

      const nextIsOwnerView = payload?.profile?.userId === profile.userId;
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

          const nextIsOwnerView = payload?.profile?.userId === profile.userId;
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

  const handleSeek = (nextTime) => {
    seekTrack(nextTime);
  };

  const handleAddToQueue = () => {
    addTrackToQueue(displayedItem, profile, musicItems);
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

  const handleDeleteMediaItem = async (mediaItemId) => {
    setDeletingMediaItemId(mediaItemId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch(`/api/media?id=${encodeURIComponent(mediaItemId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        return;
      }

      setEditingMediaItem(null);
      router.push(buildPublicProfilePath(profile.username));
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
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <div className="mb-10 border border-white/20 bg-black/35 p-6 md:p-8">
        <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="mb-4 inline-block text-sm text-gray-400 transition-colors hover:text-white"
            >
              <span aria-hidden="true">{"\u2190"}</span>
              <span className="ml-2">back</span>
            </button>
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">
              {displayedItem.mediaKind === "music"
                ? "music release"
                : displayedItem.mediaKind === "visual"
                  ? "visual piece"
                  : "video release"}
            </p>
            <h1 className="max-w-4xl text-3xl leading-tight md:text-5xl">{displayedItem.title}</h1>
            <Link
              href={buildPublicProfilePath(profile.username)}
              className="mt-4 inline-block text-sm text-gray-400 transition-colors hover:text-white"
            >
              by {profile.displayName}
            </Link>
            {displayedItem.description && (
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400 md:text-base">
                {displayedItem.description}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end text-right text-xs uppercase tracking-[0.16em] text-gray-500">
            <div className="flex flex-col items-end">
              <p>{displayedItem.visibility.replace("_", " ")}</p>
              <p className="mt-2">{formatUploadDate(displayedItem.publishedAt || displayedItem.createdAt)}</p>
            </div>
            {isOwnerView ? (
              <button
                type="button"
                onClick={() => setEditingMediaItem(displayedItem)}
                className="mt-4 inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
              >
                <Edit2 className="h-4 w-4" />
                <span>edit post</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className={displayedItem.mediaKind === "music" ? "mx-auto max-w-5xl" : ""}>
          <div className="overflow-hidden border border-white/10 bg-white/[0.03]">
            {displayedItem.mediaKind === "music" && (
              <div className="flex flex-col md:flex-row">
                <div className="aspect-square w-full border-b border-white/10 bg-white/[0.04] md:w-48 md:flex-shrink-0 md:border-b-0 md:border-r">
                  {displayedItem.coverAsset?.url ? (
                    <img
                      src={displayedItem.coverAsset.url}
                      alt={displayedItem.title}
                      className="h-full w-full object-cover"
                      style={{
                        WebkitMaskImage:
                          "radial-gradient(circle at center, black 68%, rgba(0,0,0,0.92) 78%, transparent 100%)",
                        maskImage:
                          "radial-gradient(circle at center, black 68%, rgba(0,0,0,0.92) 78%, transparent 100%)",
                      }}
                    />
                  ) : (
                    <div className="flex h-full min-h-[18rem] items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
                      <Music2 className="h-16 w-16 text-white/35" />
                    </div>
                  )}
                </div>

                <div className="flex-1 p-5 md:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-300">
                        {formatReleaseType(displayedItem.releaseType)}
                      </span>
                      <span className="border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">
                        {displayedItem.asset?.mimeType?.replace("/", " / ") || "audio"}
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
                        seekLabel={`Seek ${displayedItem.title}`}
                      />
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-gray-500">
                        <span>{displayedCurrentTime > 0 ? formatTime(displayedCurrentTime) : ""}</span>
                        <span>{displayedDuration > 0 ? formatTime(displayedDuration) : displayedItem.asset?.mimeType?.replace("/", " / ") || "audio"}</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {displayedItem.mediaKind === "visual" && (
              <div className="flex justify-center p-5 md:p-8">
                <button
                  type="button"
                  onClick={openGallery}
                  className="block w-full max-w-[42rem] cursor-pointer bg-black text-left"
                >
                  {displayedItem.asset?.url ? (
                    <img
                      src={displayedItem.asset.url}
                      alt={displayedItem.title}
                      className="max-h-[34rem] w-full object-contain"
                    />
                  ) : (
                    <div className="flex min-h-[20rem] items-center justify-center">
                      <Palette className="h-16 w-16 text-white/25" />
                    </div>
                  )}
                </button>
              </div>
            )}

            {displayedItem.mediaKind === "video" && (
              <div className="flex justify-center p-5 md:p-8">
                <button
                  type="button"
                  onClick={openGallery}
                  className="block w-full max-w-[42rem] cursor-pointer bg-black text-left"
                >
                  {displayedItem.asset?.url ? (
                    <video muted playsInline className="max-h-[34rem] w-full bg-black object-contain">
                      <source src={displayedItem.asset.url} type={displayedItem.asset.mimeType} />
                    </video>
                  ) : (
                    <div className="flex min-h-[20rem] items-center justify-center">
                      <Video className="h-16 w-16 text-white/25" />
                    </div>
                  )}
                </button>
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
            {relatedItems.map((relatedItem) => (
              <Link
                key={relatedItem.id}
                href={buildPublicMediaPath(profile.username, relatedItem.slug)}
                className="group block cursor-pointer border border-white/20 bg-white/5 p-4 transition-colors hover:border-white/40 hover:bg-white/[0.08]"
              >
                <div className="mb-3 aspect-square overflow-hidden border border-white/10 bg-black">
                  {relatedItem.coverAsset?.url ? (
                    <img
                      src={relatedItem.coverAsset.url}
                      alt={relatedItem.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                      {relatedItem.mediaKind === "music" ? (
                        <Music2 className="h-10 w-10 text-white/25" />
                      ) : relatedItem.mediaKind === "visual" ? (
                        <Palette className="h-10 w-10 text-white/25" />
                      ) : (
                        <Video className="h-10 w-10 text-white/25" />
                      )}
                    </div>
                  )}
                </div>
                <h3 className="text-sm transition-colors group-hover:text-gray-200">
                  {relatedItem.title}
                </h3>
              </Link>
            ))}
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

      {isOwnerView && editingMediaItem ? (
        <EditUploadModal
          item={editingMediaItem}
          isSubmitting={isUpdatingMedia}
          isDeleting={deletingMediaItemId === editingMediaItem.id}
          onClose={() => setEditingMediaItem(null)}
          onSave={handleSaveMediaItem}
          onDelete={handleDeleteMediaItem}
        />
      ) : null}
    </div>
  );
}
