"use client";

import { motion } from "motion/react";
import { Edit2, Heart, MessageCircle, Music, Palette, Plus, Video } from "lucide-react";
import { MusicReleasePlayer } from "./music-release-player";
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

function SocialCounts({ item }) {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <span className="inline-flex cursor-default select-none items-center gap-1.5">
        <Heart className="h-3.5 w-3.5" />
        <span>{item.likes || 0}</span>
      </span>
      <span className="inline-flex cursor-default select-none items-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5" />
        <span>{item.comments || 0}</span>
      </span>
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
  headerActions = null,
  headerBottomRight = null,
  onOpenVisual,
  onOpenVideo,
  emptyCategoryPrompt = null,
}) {
  const groupedItems = groupItems(items);
  const avatarFallback = (profile.displayName || profile.username || "?").charAt(0).toUpperCase();
  const categoryMeta = {
    music: { label: "Music", icon: Music },
    visual: { label: "Visual", icon: Palette },
    video: { label: "Video", icon: Video },
  };

  return (
    <div>
      <div className="mb-10 border border-white/20 p-6 md:p-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-br from-gray-800 to-gray-900 md:h-48 md:w-48">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-6xl text-gray-600 md:text-8xl">
                {avatarFallback}
              </div>
            )}
          </div>

          <div className="flex-1">
            <p className="mb-3 cursor-default select-none text-[11px] uppercase tracking-[0.22em] text-gray-500">
              {headerLabel}
            </p>
            <h1 className="cursor-default select-none text-3xl md:text-5xl">{profile.displayName}</h1>
            <p className="mt-2 cursor-default select-none text-gray-400">@{profile.username}</p>
            {profile.email ? (
              <p className="mt-3 cursor-default select-none text-gray-500">{profile.email}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-400">
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
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.categoryTags.map((tag) => {
                  const Icon = categoryMeta[tag]?.icon;
                  return (
                    <span
                      key={tag}
                      className="inline-flex cursor-default select-none items-center gap-2 border border-white/20 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-gray-300"
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                      <span>{categoryMeta[tag]?.label || tag}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {profile.bio ? (
              <p className="mt-6 max-w-3xl cursor-default select-none text-sm leading-relaxed text-gray-300 md:text-base">
                {profile.bio}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {canFollow && onFollowToggle ? (
                <motion.button
                  type="button"
                  onClick={onFollowToggle}
                  disabled={isUpdatingFollow}
                  className={`border px-5 py-3 text-sm tracking-wide transition-colors ${
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

              {headerActions}
            </div>

            {headerBottomRight ? (
              <div className="mt-6 flex justify-end">{headerBottomRight}</div>
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
          <h2 className="mb-8 cursor-default select-none text-2xl md:text-3xl">{contentHeading}</h2>
        ) : null}
        {profile.categoryTags?.length > 0 ? (
          <div className="space-y-12">
            {profile.categoryTags.includes("music") ? (
              <section>
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Music className="h-6 w-6" />
                    <h3 className="cursor-default select-none text-xl">music releases</h3>
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
                  <div className="grid grid-cols-1 gap-6">
                    {groupedItems.music.map((item) => (
                      <MusicReleasePlayer
                        key={item.id}
                        item={item}
                        isActive={currentTrackId === item.id}
                        isPlaying={isPlaying}
                        onOpen={onOpenItem}
                        onPlayPause={onPlayTrack}
                        onAddToQueue={onAddToQueue}
                        onShare={onShare}
                        onEdit={isOwner ? onEditItem : undefined}
                        currentTime={currentTrackId === item.id ? currentTime : 0}
                        duration={currentTrackId === item.id ? duration : 0}
                        onSeek={currentTrackId === item.id ? (nextTime) => onSeekTrack?.(item, nextTime) : undefined}
                        formatFileSize={formatFileSize}
                        formatUploadDate={formatUploadDate}
                        formatReleaseType={formatReleaseType}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {profile.categoryTags.includes("visual") ? (
              <section>
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Palette className="h-6 w-6" />
                    <h3 className="cursor-default select-none text-xl">visual art</h3>
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
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {groupedItems.visual.map((item) => (
                      <motion.div
                        key={item.id}
                        className="border border-white/20 bg-white/5 p-5 transition-colors hover:border-white/40 hover:bg-white/[0.08]"
                        whileHover={SOFT_CARD_HOVER}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <motion.button
                              type="button"
                              onClick={() => onOpenItem(item)}
                              className="cursor-pointer text-left text-lg transition-colors hover:text-gray-300"
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
                          className="mb-4 block w-full cursor-pointer overflow-hidden border border-white/10 bg-black text-left transition-colors hover:border-white/30"
                          whileHover={SOFT_CARD_HOVER}
                          whileTap={SOFT_BUTTON_TAP}
                        >
                          {item.asset?.url ? (
                            <img
                              src={item.asset.url}
                              alt={item.title}
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="aspect-square w-full bg-white/5" />
                          )}
                        </motion.button>

                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="cursor-default select-none text-xs text-gray-500">
                            {formatUploadDate(item.publishedAt || item.createdAt)}
                          </span>
                          <SocialCounts item={item} />
                        </div>

                        {item.description ? (
                          <p className="cursor-default select-none text-sm leading-relaxed text-gray-400">{item.description}</p>
                        ) : null}
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {profile.categoryTags.includes("video") ? (
              <section>
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Video className="h-6 w-6" />
                    <h3 className="cursor-default select-none text-xl">video content</h3>
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
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {groupedItems.video.map((item) => (
                      <motion.div
                        key={item.id}
                        className="border border-white/20 bg-white/5 p-5 transition-colors hover:border-white/40 hover:bg-white/[0.08]"
                        whileHover={SOFT_CARD_HOVER}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <motion.button
                              type="button"
                              onClick={() => onOpenItem(item)}
                              className="cursor-pointer text-left text-lg transition-colors hover:text-gray-300"
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
                          onClick={() => (onOpenVideo ? onOpenVideo(item) : onOpenItem(item))}
                          className="mb-4 block w-full cursor-pointer overflow-hidden border border-white/10 bg-black text-left transition-colors hover:border-white/30"
                          whileHover={SOFT_CARD_HOVER}
                          whileTap={SOFT_BUTTON_TAP}
                        >
                          {item.asset?.url ? (
                            <video muted playsInline className="aspect-video w-full bg-black object-cover">
                              <source src={item.asset.url} type={item.asset.mimeType} />
                            </video>
                          ) : (
                            <div className="aspect-video w-full bg-white/5" />
                          )}
                        </motion.button>

                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="cursor-default select-none text-xs text-gray-500">
                            {formatUploadDate(item.publishedAt || item.createdAt)}
                          </span>
                          <SocialCounts item={item} />
                        </div>

                        {item.description ? (
                          <p className="cursor-default select-none text-sm leading-relaxed text-gray-400">{item.description}</p>
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
