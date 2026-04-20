import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { ImageCropModal } from "./image-crop-modal";
import { ViewportPortal } from "./viewport-portal";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

const VISIBILITY_OPTIONS = [
  { value: "private", label: "private" },
  { value: "invite_only", label: "invite only" },
  { value: "unlisted", label: "unlisted" },
  { value: "public", label: "public" },
];

function mapReleaseTracks(tracks) {
  if (!Array.isArray(tracks)) {
    return [];
  }

  return tracks.map((track, index) => ({
    id: track.id,
    title: track.title || `track ${index + 1}`,
    fileName: track.asset?.fileName || "",
    trackNumber: track.trackNumber ?? index + 1,
  }));
}

export function EditUploadModal({
  item,
  releaseTracks = null,
  isSubmitting,
  isDeleting,
  onClose,
  onSave,
  onDelete,
  onDeleteTrack,
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [visibility, setVisibility] = useState(item?.visibility || "invite_only");
  const [coverArt, setCoverArt] = useState(null);
  const [coverArtDraft, setCoverArtDraft] = useState(null);
  const [coverArtPreviewUrl, setCoverArtPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const releaseTrackEntries = useMemo(() => mapReleaseTracks(releaseTracks), [releaseTracks]);
  const [trackedReleaseTracks, setTrackedReleaseTracks] = useState(releaseTrackEntries);
  const [removingTrackId, setRemovingTrackId] = useState("");
  const isMultiTrackRelease =
    item?.mediaKind === "music" &&
    item?.releaseType &&
    item.releaseType !== "single" &&
    trackedReleaseTracks.length > 0;

  useEffect(() => {
    setTitle(item?.title || "");
    setDescription(item?.description || "");
    setVisibility(item?.visibility || "invite_only");
    setCoverArt(null);
    setCoverArtDraft(null);
    setCoverArtPreviewUrl("");
    setError("");
    setIsConfirmingDelete(false);
  }, [item]);

  useEffect(() => {
    if (!coverArt) {
      setCoverArtPreviewUrl("");
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(coverArt);
    setCoverArtPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [coverArt]);
  useEffect(() => {
    setTrackedReleaseTracks(releaseTrackEntries);
    setRemovingTrackId("");
  }, [releaseTrackEntries]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("a title is required.");
      return;
    }

    await onSave({
      id: item.id,
      title: title.trim(),
      description: description.trim(),
      visibility,
      coverArt,
    });
  };

  const [confirmingTrackId, setConfirmingTrackId] = useState("");

  const handleRemoveTrack = async (track) => {
    if (!onDeleteTrack || trackedReleaseTracks.length <= 1) {
      setError("keep at least one track in the release.");
      return;
    }

    setError("");
    setRemovingTrackId(track.id);
    try {
      const success = await onDeleteTrack(track.id);
      if (!success) {
        setError("failed to delete track. please try again.");
        return;
      }
        setTrackedReleaseTracks((current) => current.filter((entry) => entry.id !== track.id));
        setConfirmingTrackId("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "failed to delete track. please try again.",
      );
    } finally {
      setRemovingTrackId("");
    }
  };

  return (
    <ViewportPortal>
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => {
        if (!isSubmitting && !isDeleting) {
          onClose();
        }
      }}
    >
      <motion.div
        className="flex h-[min(42rem,calc(100vh-2rem))] w-full max-w-lg flex-col overflow-hidden border border-white/20 bg-black p-5 md:p-6"
        {...SOFT_PANEL_REVEAL}
        transition={PAGE_TRANSITION}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex flex-shrink-0 items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl">edit upload</h3>
            <p className="mt-2 text-sm text-gray-400">
              update the title, description, and availability for this upload.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="border border-white/20 p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-50"
            aria-label="Close edit upload modal"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="archive-scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
          <div>
            <label className="mb-2 block text-sm text-gray-400">title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
              disabled={isSubmitting || isDeleting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4000}
              rows={4}
              className="w-full resize-none overflow-y-auto border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition-colors focus:border-white/60 archive-scrollbar-thin"
              disabled={isSubmitting || isDeleting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">availability</label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
              className="w-full border border-white/20 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
              disabled={isSubmitting || isDeleting}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {isMultiTrackRelease ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm text-gray-400">tracks in this release</label>
                <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                  {trackedReleaseTracks.length} tracks
                </span>
              </div>
              <div className="space-y-3 border border-white/15 bg-white/[0.02] p-4 pr-2 max-h-64 overflow-y-auto archive-scrollbar-thin">
                {trackedReleaseTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="grid gap-2 md:grid-cols-[2rem_minmax(0,1fr)_2.5rem] md:items-start"
                  >
                    <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                      {track.trackNumber ?? index + 1}
                    </span>
                    <div>
                      <input
                        type="text"
                        value={track.title}
                        readOnly
                        className="w-full border border-white/20 bg-transparent px-4 py-2.5 text-white outline-none transition-colors"
                        disabled
                      />
                      {track.fileName ? (
                        <p className="mt-1 truncate text-xs text-gray-500">{track.fileName}</p>
                      ) : null}
                    </div>
                    <motion.button
                      type="button"
                      onClick={() => setConfirmingTrackId(track.id)}
                      disabled={
                        isSubmitting ||
                        isDeleting ||
                        removingTrackId === track.id ||
                        trackedReleaseTracks.length <= 1
                      }
                      className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
                      aria-label={`Remove ${track.title}`}
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      {removingTrackId === track.id ? (
                        <span className="text-[10px] uppercase tracking-[0.18em]">...</span>
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </motion.button>
                    {confirmingTrackId === track.id ? (
                      <div className="col-span-full rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                        <p>confirm deletion. this removes the track immediately and cannot be undone.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <motion.button
                            type="button"
                            onClick={() => setConfirmingTrackId("")}
                            className="border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/40 hover:text-white"
                            whileHover={SOFT_BUTTON_HOVER}
                            whileTap={SOFT_BUTTON_TAP}
                          >
                            cancel
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={() => handleRemoveTrack(track)}
                            disabled={removingTrackId === track.id}
                            className="border border-red-500/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            whileHover={SOFT_BUTTON_HOVER}
                            whileTap={SOFT_BUTTON_TAP}
                          >
                            {removingTrackId === track.id ? "removing..." : "confirm delete"}
                          </motion.button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                <p className="text-xs text-gray-500">
                  Removing a track deletes it immediately and cannot be undone. Keep at least one track in the
                  release.
                </p>
              </div>
            </div>
          ) : null}

          {item?.mediaKind === "music" && (
            <div>
              <label className="mb-2 block text-sm text-gray-400">album art</label>
              <label className="flex cursor-pointer items-center gap-3 border border-dashed border-white/30 px-4 py-5 transition-colors hover:border-white/50">
                <Upload className="h-5 w-5 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {coverArt ? coverArt.name : item?.coverAsset?.fileName || "choose new cover art"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    replace the current cover image with jpg, png, webp, gif, or avif.
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isSubmitting || isDeleting}
                  onChange={(event) => setCoverArtDraft(event.target.files?.[0] ?? null)}
                />
              </label>

              {(coverArtPreviewUrl || item?.coverAsset?.url) && (
                <div className="mt-3 overflow-hidden border border-white/15 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                    cover preview
                  </div>
                  <img
                    src={coverArtPreviewUrl || item.coverAsset.url}
                    alt="cover art preview"
                    className="aspect-square w-full max-w-[12rem] object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="border border-red-500/20 bg-red-500/5 px-4 py-4">
            <div className="mb-3 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-red-300" />
              <div>
                <p className="text-sm text-red-200">delete this upload</p>
                <p className="mt-1 text-xs text-gray-400">
                  this permanently removes the file and its metadata from your archive.
                </p>
              </div>
            </div>
            {isConfirmingDelete ? (
              <div className="space-y-3">
                <p className="text-xs text-red-200">
                  confirm deletion. this action cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={isSubmitting || isDeleting}
                    className="border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => onDelete(item.id, { scope: isMultiTrackRelease ? "release" : "item" })}
                    disabled={isSubmitting || isDeleting}
                    className="border border-red-500/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    {isDeleting ? "deleting..." : "confirm delete"}
                  </motion.button>
                </div>
              </div>
            ) : (
              <motion.button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isSubmitting || isDeleting}
                className="border border-red-500/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                delete upload
              </motion.button>
            )}
          </div>

          <div className="flex gap-3">
            <motion.button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
              className="flex-1 border border-white/20 px-4 py-3 text-gray-300 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={isSubmitting || isDeleting}
              className="flex-1 border border-white/40 px-4 py-3 transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              {isSubmitting ? "saving..." : "save changes"}
            </motion.button>
          </div>
        </form>
      </motion.div>

      {coverArtDraft ? (
        <ImageCropModal
          file={coverArtDraft}
          title="crop album art"
          description="adjust the frame before saving so the cover lands cleanly across profile cards, the player, and public pages."
          confirmLabel="use cover art"
          outputSize={1400}
          onClose={() => setCoverArtDraft(null)}
          onConfirm={async (croppedFile) => {
            setCoverArt(croppedFile);
            setCoverArtDraft(null);
          }}
        />
      ) : null}
    </motion.div>
    </ViewportPortal>
  );
}
