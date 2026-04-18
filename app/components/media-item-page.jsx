import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Edit2, ListPlus, Music2, Palette, Pause, Play, Video } from "lucide-react";
import { Waveform } from "./waveform";
import { MediaSocialPanel } from "./media-social-panel";
import { MentionText } from "./mention-text";
import { ShareLinkButton } from "./share-link-button";
import { FadeInImage } from "./fade-in-image";
import { buildPublicMediaPath } from "@/lib/media-slugs";

const VisualGalleryLightbox = dynamic(
  () => import("./visual-gallery-lightbox").then((mod) => mod.VisualGalleryLightbox),
  { ssr: false },
);
const VideoPlayer = dynamic(() => import("./video-player").then((mod) => mod.VideoPlayer), {
  ssr: false,
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

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

function kindLabel(mediaKind) {
  if (mediaKind === "music") {
    return "music release";
  }

  if (mediaKind === "visual") {
    return "visual piece";
  }

  return "video release";
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

export function MediaItemPage({
  item,
  isPlaying,
  isActive,
  currentTime,
  duration,
  onBack,
  onEdit,
  onPlayPause,
  onAddToQueue,
  onSeek,
  onSocialUpdate,
  profile,
  galleryItems = [],
  formatUploadDate,
  formatFileSize,
  formatReleaseType,
}) {
  const waveformData = buildWaveformData(`${item.id}:${item.asset?.fileName || item.title}`);
  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTitle = getMediaDisplayTitle(item);
  const displayDescription = cleanReleaseDescription(item.description);
  const sharePath =
    profile?.username && item?.slug ? buildPublicMediaPath(profile.username, item.slug) : "";
  const shareUrl =
    sharePath && typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath;
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const resolvedGalleryItems = useMemo(
    () =>
      galleryItems.length > 0
        ? galleryItems
        : item.mediaKind === "visual" || item.mediaKind === "video"
          ? [item]
          : [],
    [galleryItems, item],
  );

  useEffect(() => {
    // The lightbox is tied to the displayed item and must close when that item changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLightboxIndex(-1);
  }, [item.id]);

  const openPreviewLightbox = () => {
    const nextIndex = resolvedGalleryItems.findIndex((entry) => entry.id === item.id);
    if (nextIndex !== -1) {
      setLightboxIndex(nextIndex);
    }
  };

  return (
    <div>
      <div className="border border-white/20 bg-black/35 p-4 md:p-8">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:mb-8 md:flex-row md:items-start md:justify-between md:gap-4 md:pb-6">
          <div>
            <motion.button
              type="button"
              onClick={onBack}
              className="mb-3 text-sm text-gray-400 transition-colors hover:text-white md:mb-4"
              whileHover={{ x: -4 }}
              whileTap={{ scale: 0.97 }}
            >
              <span aria-hidden="true">{"\u2190"}</span>
              <span className="ml-2">back</span>
            </motion.button>
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 md:mb-3 md:text-[11px] md:tracking-[0.22em]">
              {kindLabel(item.mediaKind)}
            </p>
            <h3 className="max-w-4xl text-2xl leading-tight md:text-5xl">{displayTitle}</h3>
            {displayDescription && (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400 md:mt-4 md:text-base">
                <MentionText text={displayDescription} />
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {shareUrl ? (
              <ShareLinkButton
                url={shareUrl}
                label="share post"
                className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-white/40 hover:text-white"
              />
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
            >
              <Edit2 className="h-4 w-4" />
              <span>edit upload</span>
            </button>
          </div>
        </div>

        <div className={item.mediaKind === "music" ? "mx-auto max-w-5xl" : ""}>
          <div className="overflow-hidden border border-white/10 bg-white/[0.03]">
            {item.mediaKind === "music" && (
              <div className="flex flex-col md:flex-row">
                <div className="mx-auto aspect-square w-full max-w-[18rem] border-b border-white/10 bg-white/[0.04] md:mx-0 md:w-48 md:flex-shrink-0 md:border-b-0 md:border-r">
                  {item.coverAsset?.url ? (
                    <FadeInImage
                      src={item.coverAsset.url}
                      alt={displayTitle}
                      className="h-full w-full object-cover"
                      containerClassName="h-full w-full"
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
                      {item.releaseType && (
                        <span className="border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-300">
                          {formatReleaseType(item.releaseType)}
                        </span>
                      )}
                      <span className="border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">
                        {item.visibility.replace("_", " ")}
                      </span>
                    </div>

                    {onAddToQueue ? (
                      <motion.button
                        type="button"
                        onClick={() => onAddToQueue(item)}
                        className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <ListPlus className="h-4 w-4" />
                        <span>add to queue</span>
                      </motion.button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-4">
                      <motion.button
                        type="button"
                        onClick={() => onPlayPause(item)}
                        disabled={!item.asset?.url}
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] transition-colors hover:border-white/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                        whileTap={{ scale: 0.94 }}
                      >
                        {isPlaying && isActive ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="ml-0.5 h-5 w-5" />
                        )}
                      </motion.button>

                      <div className="min-w-0 flex-1">
                        <div className="relative mb-2 overflow-hidden border border-white/10 bg-white/[0.02] px-3 py-3">
                          <Waveform
                            data={waveformData}
                            audioUrl={item.asset?.url}
                            isPlaying={isPlaying && isActive}
                            height={52}
                            progress={isActive ? progress : 0}
                            currentTime={isActive ? currentTime : 0}
                            duration={isActive ? duration : 0}
                            onSeek={isActive ? onSeek : undefined}
                            seekLabel={`Seek ${displayTitle}`}
                            disabled={!isActive}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-gray-500">
                          <span>{isActive ? formatTime(currentTime) : ""}</span>
                          <span>{isActive ? formatTime(duration) : item.asset?.mimeType?.replace("/", " / ") || "audio"}</span>
                        </div>
                      </div>
                    </div>

                </div>
              </div>
            )}

            {item.mediaKind === "visual" && (
              <div className="flex justify-center p-4 md:p-8">
                <button
                  type="button"
                  onClick={openPreviewLightbox}
                  className="inline-flex max-w-full cursor-pointer justify-center text-left"
                >
                  {item.asset?.url ? (
                    <FadeInImage
                      src={item.asset.url}
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

            {item.mediaKind === "video" && (
              <div className="flex justify-center p-3 sm:p-5 md:p-8">
                {item.asset?.url ? (
                  <VideoPlayer
                    src={item.asset.url}
                    poster={item.coverAsset?.url || ""}
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

      <div className="mt-8">
        <MediaSocialPanel
          mediaItemId={item.id}
          initialLikeCount={item.likes || 0}
          initialCommentCount={item.comments || 0}
          initialIsLiked={item.isLiked || false}
          onUpdate={onSocialUpdate}
        />
      </div>

      <VisualGalleryLightbox
        profile={profile}
        items={resolvedGalleryItems}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onPrevious={() =>
          setLightboxIndex((current) =>
            resolvedGalleryItems.length > 0
              ? (current - 1 + resolvedGalleryItems.length) % resolvedGalleryItems.length
              : -1,
          )
        }
        onNext={() =>
          setLightboxIndex((current) =>
            resolvedGalleryItems.length > 0
              ? (current + 1) % resolvedGalleryItems.length
              : -1,
          )
        }
      />
    </div>
  );
}
