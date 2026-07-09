"use client";

import { motion } from "motion/react";
import { Edit2, Heart, MessageCircle, MessageSquare, Music, Palette, Plus, Video } from "lucide-react";
import { MusicReleasePlayer } from "./music-release-player";
import { MultiTrackReleaseCard } from "./multi-track-release-card";
import { MentionText } from "./mention-text";
import { VideoPlayer } from "./video-player";
import { FadeInImage } from "./fade-in-image";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_CARD_HOVER } from "@/lib/motion";

function groupItems(items) {
  return {
    music: items.filter((item) => item.mediaKind === "music"),
    visual: items.filter((item) => item.mediaKind === "visual"),
    video: items.filter((item) => item.mediaKind === "video"),
  };
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
    createdAt: tracks[0]?.publishedAt || tracks[0]?.createdAt,
    tracks,
    likes: tracks.reduce((total, track) => total + (track.likes || 0), 0),
    comments: tracks.reduce((total, track) => total + (track.comments || 0), 0),
    isLiked: tracks.some((track) => track.isLiked),
  };
}

function buildMusicDisplayEntries(items) {
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

function CountButton({ value, label, onClick }) {
  if (!onClick) {
    return (
      <span className="cursor-default select-none">
        <span className="font-medium text-white">{value}</span> {label}
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="cursor-pointer select-none border border-white/10 px-3 py-1.5 transition-colors hover:border-white/30 hover:bg-white/5"
      whileHover={SOFT_BUTTON_HOVER}
      whileTap={SOFT_BUTTON_TAP}
    >
      <span className="font-medium text-white">{value}</span> {label}
    </motion.button>
  );
}

function SocialCounts({ item, onToggleLike, onOpenComments }) {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <button
        type="button"
        onClick={() => onToggleLike?.(item)}
        disabled={!onToggleLike}
        className={`inline-flex items-center gap-1.5 transition-colors ${
          item.isLiked ? "text-white" : "hover:text-white"
        } ${onToggleLike ? "" : "cursor-default select-none text-gray-500"}`}
      >
        <Heart className={`h-3.5 w-3.5 ${item.isLiked ? "fill-white text-white" : ""}`} />
        <span>{item.likes || 0}</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenComments?.(item)}
        disabled={!onOpenComments}
        className={`inline-flex items-center gap-1.5 transition-colors ${
          onOpenComments ? "hover:text-white" : "cursor-default select-none text-gray-500"
        }`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>{item.comments || 0}</span>
      </button>
    </div>
  );
}

export function ProfileArchiveView({
  profile,
  items,
  isOwner = false,
  headerLabel = "profile",
  contentHeading = "",
  contentNotice,
  isLoadingMedia = false,
  currentTrackId,
  isPlaying,
  currentTime,
  duration,
  onOpenItem,
  onPlayTrack,
  onSeekTrack,
  onAddToQueue,
  onShare,
  onEditItem,
  onUpload,
  onOpenConnections,
  canFollow = false,
  isFollowing = false,
  isUpdatingFollow = false,
  onFollowToggle,
  onMessageProfile,
  isMessagingAvailable = false,
  headerActions = null,
  headerTopRight = null,
  headerBottomRight = null,
  onOpenVisual,
  onOpenVideo,
  emptyCategoryPrompt = null,
  onToggleLike,
  onOpenComments,
}) {
  const groupedItems = groupItems(items);
  const musicDisplayEntries = buildMusicDisplayEntries(groupedItems.music);
  const avatarFallback = (profile.displayName || profile.username || "?").charAt(0).toUpperCase();
  const categoryMeta = {
    music: { label: "Music", icon: Music },
    visual: { label: "Visual", icon: Palette },
    video: { label: "Video", icon: Video },
  };

  return (
    <div>
      <div className="mb-8 border border-white/20 p-4 md:mb-10 md:p-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-br from-gray-800 to-gray-900 md:h-48 md:w-48">
            {profile.avatarUrl ? (
              <FadeInImage
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="h-full w-full object-cover"
                containerClassName="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl text-gray-600 md:text-8xl">
                {avatarFallback}
              </div>
            )}
          </div>

          <div className="flex-1">
            {headerTopRight ? (
              <div className="mb-4 flex justify-end">{headerTopRight}</div>
            ) : null}
            <p className="mb-3 cursor-default select-none text-[11px] uppercase tracking-[0.22em] text-gray-500">
              {headerLabel}
            </p>
            <h1 className="cursor-default select-none text-2xl md:text-5xl">{profile.displayName}</h1>
            <p className="mt-1.5 cursor-default select-none text-sm text-gray-400 md:mt-2 md:text-base">@{profile.username}</p>
            {profile.email ? (
              <p className="mt-3 cursor-default select-none text-gray-500">{profile.email}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-400 md:gap-3 md:text-sm">
              <CountButton
                value={profile.followerCount || 0}
                label="followers"
                onClick={onOpenConnections ? () => onOpenConnections("followers") : undefined}
              />
              <CountButton
                value={profile.followingCount || 0}
                label="following"
                onClick={onOpenConnections ? () => onOpenConnections("following") : undefined}
              />
              <span className="cursor-default select-none">
                <span className="font-medium text-white">{items.length}</span> uploads
              </span>
            </div>

            {profile.categoryTags?.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2 md:mt-5">
                {profile.categoryTags.map((tag) => {
                  const Icon = categoryMeta[tag]?.icon;
                  return (
                    <span
                      key={tag}
                      className="inline-flex cursor-default select-none items-center gap-1.5 border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-gray-300 md:gap-2 md:px-3 md:text-xs md:tracking-[0.18em]"
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                      <span>{categoryMeta[tag]?.label || tag}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {profile.bio ? (
              <p className="mt-4 max-w-3xl cursor-default select-none text-sm leading-relaxed text-gray-300 md:mt-6 md:text-base">
                <MentionText text={profile.bio} />
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2 md:mt-6 md:gap-3">
              {canFollow && onFollowToggle ? (
                <motion.button
                  type="button"
                  onClick={onFollowToggle}
                  disabled={isUpdatingFollow}
                  className={`border px-4 py-2.5 text-sm tracking-wide transition-colors md:px-5 md:py-3 ${
                    isFollowing
                      ? "border-white/40 bg-white text-black hover:bg-white/90"
                      : "border-white/40 bg-transparent text-white hover:border-white/60 hover:bg-white/5"
                  } disabled:opacity-50`}
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  {isFollowing ? "unfollow" : "follow"}
                </motion.button>
              ) : null}

              {isMessagingAvailable && onMessageProfile ? (
                <motion.button
                  type="button"
                  onClick={onMessageProfile}
                  className="inline-flex items-center gap-2 border border-white/25 bg-white/[0.03] px-4 py-2.5 text-sm tracking-wide text-white transition-colors hover:border-white/50 hover:bg-white/[0.07] md:px-5 md:py-3"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>message</span>
                </motion.button>
              ) : null}

              {headerActions}
            </div>

            {headerBottomRight ? (
              <div className="mt-5 flex justify-start md:mt-6 md:justify-end">{headerBottomRight}</div>
            ) : null}
          </div>
        </div>
      </div>

      {contentNotice?.message ? (
        <div
          className={`mb-6 border px-4 py-3 text-sm ${
            contentNotice.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-green-500/40 bg-green-500/10 text-green-400"
          }`}
        >
          {contentNotice.message}
        </div>
      ) : null}

      {isLoadingMedia ? (
        <div className="mb-6 border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-400">
          loading uploaded content...
        </div>
      ) : null}

      <div>
        {contentHeading ? (
          <h2 className="mb-6 cursor-default select-none text-xl md:mb-8 md:text-3xl">{contentHeading}</h2>
        ) : null}
        {profile.categoryTags?.length > 0 ? (
          <div className="space-y-9 md:space-y-12">
            {profile.categoryTags.includes("music") ? (
              <section>
                <div className="mb-4 flex items-center justify-between gap-3 md:mb-6 md:gap-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <Music className="h-5 w-5 md:h-6 md:w-6" />
                    <h3 className="cursor-default select-none text-lg md:text-xl">music releases</h3>
                  </div>

                  {isOwner && onUpload ? (
                    <motion.button
                      type="button"
                      onClick={() => onUpload("music")}
                      className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-sm transition-all duration-300 hover:border-white/60 hover:bg-white/10 md:px-6 md:py-3 md:text-base"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <Plus className="h-4 w-4" />
                      <span>upload release</span>
                    </motion.button>
                  ) : null}
                </div>

                {groupedItems.music.length === 0 ? (
                  <div className="border border-white/20 border-dashed p-12 text-center md:p-16">
                    <Music className="mx-auto mb-4 h-10 w-10 text-gray-500 md:h-12 md:w-12" />
                    <p className="mb-2 cursor-default select-none text-base text-gray-400 md:text-lg">
                      {isOwner ? "no music releases yet" : "no public music releases yet"}
                    </p>
                    <p className="cursor-default select-none text-sm text-gray-500">
                      {isOwner ? "upload your first single, EP, or album" : "Tracks published by this artist will appear here."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    {musicDisplayEntries.map((entry) =>
                      entry.kind === "release" ? (
                        <MultiTrackReleaseCard
                          key={entry.id}
                          release={entry.release}
                          activeTrackId={currentTrackId}
                          isPlaying={isPlaying}
                          onOpen={onOpenItem}
                          onPlayTrack={onPlayTrack}
                          onAddTrackToQueue={onAddToQueue}
                          onToggleLike={onToggleLike}
                          onOpenComments={onOpenComments}
                          onShare={onShare}
                          onEditRelease={isOwner ? onEditItem : undefined}
                          formatFileSize={formatFileSize}
                          formatUploadDate={formatUploadDate}
                          maxTrackListHeight="max-h-52"
                        />
                      ) : (
                        <MusicReleasePlayer
                          key={entry.item.id}
                          item={entry.item}
                          isActive={currentTrackId === entry.item.id}
                          isPlaying={isPlaying}
                          onOpen={onOpenItem}
                          onPlayPause={onPlayTrack}
                          onAddToQueue={onAddToQueue}
                          onShare={onShare}
                          onEdit={isOwner ? onEditItem : undefined}
                          currentTime={currentTrackId === entry.item.id ? currentTime : 0}
                          duration={currentTrackId === entry.item.id ? duration : 0}
                          onSeek={currentTrackId === entry.item.id ? (nextTime) => onSeekTrack?.(entry.item, nextTime) : undefined}
                          formatFileSize={formatFileSize}
                          formatUploadDate={formatUploadDate}
                          formatReleaseType={formatReleaseType}
                        />
                      ),
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {profile.categoryTags.includes("visual") ? (
              <section>
                <div className="mb-4 flex items-center justify-between gap-3 md:mb-6 md:gap-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <Palette className="h-5 w-5 md:h-6 md:w-6" />
                    <h3 className="cursor-default select-none text-lg md:text-xl">visual art</h3>
                  </div>

                  {isOwner && onUpload ? (
                    <motion.button
                      type="button"
                      onClick={() => onUpload("visual")}
                      className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-sm transition-all duration-300 hover:border-white/60 hover:bg-white/10 md:px-6 md:py-3 md:text-base"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <Plus className="h-4 w-4" />
                      <span>upload artwork</span>
                    </motion.button>
                  ) : null}
                </div>

                {groupedItems.visual.length === 0 ? (
                  <div className="border border-white/20 border-dashed p-12 text-center md:p-16">
                    <Palette className="mx-auto mb-4 h-10 w-10 text-gray-500 md:h-12 md:w-12" />
                    <p className="mb-2 cursor-default select-none text-base text-gray-400 md:text-lg">
                      {isOwner ? "no visual art yet" : "no public visual art yet"}
                    </p>
                    <p className="cursor-default select-none text-sm text-gray-500">
                      {isOwner ? "share your photography, illustrations, or digital art" : "Published artwork will appear here."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                    {groupedItems.visual.map((item) => (
                      <motion.div
                        key={item.id}
                        className="border border-white/20 bg-white/5 p-3.5 transition-colors hover:border-white/40 hover:bg-white/[0.08] md:p-5"
                        whileHover={SOFT_CARD_HOVER}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3 md:mb-4">
                          <div className="min-w-0">
                            <motion.button
                              type="button"
                              onClick={() => onOpenItem(item)}
                              className="cursor-pointer text-left text-base transition-colors hover:text-gray-300 md:text-lg"
                              whileHover={SOFT_BUTTON_HOVER}
                              whileTap={SOFT_BUTTON_TAP}
                            >
                              {item.title}
                            </motion.button>
                            <span className="mt-1 block cursor-default select-none text-xs uppercase tracking-[0.18em] text-gray-500">
                              {item.visibility.replace("_", " ")}
                            </span>
                          </div>

                          {isOwner && onEditItem ? (
                            <motion.button
                              type="button"
                              onClick={() => onEditItem(item)}
                              className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                              whileHover={SOFT_BUTTON_HOVER}
                              whileTap={SOFT_BUTTON_TAP}
                            >
                              <Edit2 className="h-4 w-4" />
                              <span>edit upload</span>
                            </motion.button>
                          ) : null}
                        </div>

                        <motion.button
                          type="button"
                          onClick={() => (onOpenVisual ? onOpenVisual(item) : onOpenItem(item))}
                          className="mb-3 block w-full cursor-pointer overflow-hidden border border-white/10 bg-black text-left transition-colors hover:border-white/30 md:mb-4"
                          whileHover={SOFT_CARD_HOVER}
                          whileTap={SOFT_BUTTON_TAP}
                        >
                          {item.previewAsset?.url || item.asset?.url ? (
                            <FadeInImage
                              src={item.previewAsset?.url || item.asset.url}
                              alt={item.title}
                              className="aspect-[4/3] w-full object-cover"
                            />
                          ) : (
                            <div className="aspect-[4/3] w-full bg-white/5" />
                          )}
                        </motion.button>

                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="cursor-default select-none text-xs text-gray-500">
                            {formatUploadDate(item.publishedAt || item.createdAt)}
                          </span>
                          <SocialCounts item={item} onToggleLike={onToggleLike} onOpenComments={onOpenComments} />
                        </div>

                        {item.description ? (
                          <p className="cursor-default select-none text-sm leading-relaxed text-gray-400">
                            <MentionText text={item.description} />
                          </p>
                        ) : null}
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {profile.categoryTags.includes("video") ? (
              <section>
                <div className="mb-4 flex items-center justify-between gap-3 md:mb-6 md:gap-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <Video className="h-5 w-5 md:h-6 md:w-6" />
                    <h3 className="cursor-default select-none text-lg md:text-xl">video content</h3>
                  </div>

                  {isOwner && onUpload ? (
                    <motion.button
                      type="button"
                      onClick={() => onUpload("video")}
                      className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-sm transition-all duration-300 hover:border-white/60 hover:bg-white/10 md:px-6 md:py-3 md:text-base"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <Plus className="h-4 w-4" />
                      <span>upload video</span>
                    </motion.button>
                  ) : null}
                </div>

                {groupedItems.video.length === 0 ? (
                  <div className="border border-white/20 border-dashed p-12 text-center md:p-16">
                    <Video className="mx-auto mb-4 h-10 w-10 text-gray-500 md:h-12 md:w-12" />
                    <p className="mb-2 cursor-default select-none text-base text-gray-400 md:text-lg">
                      {isOwner ? "no videos yet" : "no public videos yet"}
                    </p>
                    <p className="cursor-default select-none text-sm text-gray-500">
                      {isOwner ? "upload films, music videos, or motion graphics" : "Published video work will appear here."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                    {groupedItems.video.map((item) => (
                      <motion.div
                        key={item.id}
                        className="border border-white/20 bg-white/5 p-3.5 transition-colors hover:border-white/40 hover:bg-white/[0.08] md:p-5"
                        whileHover={SOFT_CARD_HOVER}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3 md:mb-4">
                          <div className="min-w-0">
                            <motion.button
                              type="button"
                              onClick={() => onOpenItem(item)}
                              className="cursor-pointer text-left text-base transition-colors hover:text-gray-300 md:text-lg"
                              whileHover={SOFT_BUTTON_HOVER}
                              whileTap={SOFT_BUTTON_TAP}
                            >
                              {item.title}
                            </motion.button>
                            <span className="mt-1 block cursor-default select-none text-xs uppercase tracking-[0.18em] text-gray-500">
                              {item.visibility.replace("_", " ")}
                            </span>
                          </div>

                          {isOwner && onEditItem ? (
                            <motion.button
                              type="button"
                              onClick={() => onEditItem(item)}
                              className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                              whileHover={SOFT_BUTTON_HOVER}
                              whileTap={SOFT_BUTTON_TAP}
                            >
                              <Edit2 className="h-4 w-4" />
                              <span>edit upload</span>
                            </motion.button>
                          ) : null}
                        </div>

                        <div className="mb-3 md:mb-4">
                          {item.asset?.url ? (
                            <div className="w-full">
                              <VideoPlayer
                                src={item.asset.url}
                                poster={item.coverAsset?.url || ""}
                                className="w-full border border-white/10"
                                ratioClass="aspect-video"
                                useIntrinsicAspect={false}
                                allowFullscreen
                              />
                            </div>
                          ) : (
                            <div className="aspect-video w-full border border-white/10 bg-white/5" />
                          )}
                        </div>

                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="cursor-default select-none text-xs text-gray-500">
                            {formatUploadDate(item.publishedAt || item.createdAt)}
                          </span>
                          <SocialCounts item={item} onToggleLike={onToggleLike} onOpenComments={onOpenComments} />
                        </div>

                        {item.description ? (
                          <p className="cursor-default select-none text-sm leading-relaxed text-gray-400">
                            <MentionText text={item.description} />
                          </p>
                        ) : null}
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : (
          <div className="border border-white/20 border-dashed p-12 text-center md:p-16">
            <UploadFallback />
            <p className="mb-2 cursor-default select-none text-base text-gray-400 md:text-lg">
              {isOwner ? "select content categories first" : "no profile categories yet"}
            </p>
            <p className="cursor-default select-none text-sm text-gray-500">
              {emptyCategoryPrompt ||
                (isOwner
                  ? "choose music, visual, or video in edit mode to start uploading content"
                  : "This archive will fill in as the artist completes their profile.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadFallback() {
  return (
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-gray-500">
      <Plus className="h-5 w-5" />
    </div>
  );
}
