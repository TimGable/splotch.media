import { useEffect, useState } from "react";
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

export function EditUploadModal({
  item,
  isSubmitting,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [visibility, setVisibility] = useState(item?.visibility || "invite_only");
  const [coverArt, setCoverArt] = useState(null);
  const [coverArtDraft, setCoverArtDraft] = useState(null);
  const [coverArtPreviewUrl, setCoverArtPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("A title is required.");
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
        className="w-full max-w-xl border border-white/20 bg-black p-6 md:p-8"
        {...SOFT_PANEL_REVEAL}
        transition={PAGE_TRANSITION}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl">edit upload</h3>
            <p className="mt-2 text-sm text-gray-400">
              Update the title, description, and availability for this upload.
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

        <form onSubmit={handleSubmit} className="space-y-5">
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
              className="w-full resize-none border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
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
                    Replace the current cover image with JPG, PNG, WEBP, GIF, or AVIF.
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
                    alt="Cover art preview"
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
                <p className="text-sm text-red-200">Delete this upload</p>
                <p className="mt-1 text-xs text-gray-400">
                  This permanently removes the file and its metadata from your archive.
                </p>
              </div>
            </div>
            {isConfirmingDelete ? (
              <div className="space-y-3">
                <p className="text-xs text-red-200">
                  Confirm deletion. This action cannot be undone.
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
                    onClick={() => onDelete(item.id)}
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
          description="Adjust the frame before saving so the cover lands cleanly across profile cards, the player, and public pages."
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
