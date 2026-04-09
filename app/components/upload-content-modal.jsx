import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Upload, X } from "lucide-react";
import { ImageCropModal } from "./image-crop-modal";
import { ViewportPortal } from "./viewport-portal";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

const ACCEPT_BY_KIND = {
  music: "audio/*",
  visual: "image/*",
  video: "video/*",
};

const LABEL_BY_KIND = {
  music: "release",
  visual: "art",
  video: "video",
};

const MUSIC_RELEASE_TYPE_OPTIONS = [
  { value: "single", label: "single" },
  { value: "ep", label: "EP" },
  { value: "album", label: "album" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "public" },
  { value: "unlisted", label: "unlisted" },
  { value: "invite_only", label: "invite only" },
  { value: "private", label: "private" },
];

const MAX_TRACKS_PER_RELEASE = 15;

function fileNameToTitle(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function UploadContentModal({ mediaKind, isSubmitting, onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseType, setReleaseType] = useState("single");
  const [visibility, setVisibility] = useState("public");
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [trackTitles, setTrackTitles] = useState([]);
  const [coverArt, setCoverArt] = useState(null);
  const [coverArtDraft, setCoverArtDraft] = useState(null);
  const [coverArtPreviewUrl, setCoverArtPreviewUrl] = useState("");
  const [error, setError] = useState("");

  const itemLabel = useMemo(() => LABEL_BY_KIND[mediaKind] || "file", [mediaKind]);
  const isMultiTrackMusic = mediaKind === "music" && releaseType !== "single";

  useEffect(() => {
    if (!isMultiTrackMusic) {
      setFiles([]);
      setTrackTitles([]);
    }
  }, [isMultiTrackMusic]);

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

  const handleMusicFileSelection = (nextFiles) => {
    const limitedFiles = nextFiles.slice(0, MAX_TRACKS_PER_RELEASE);
    setFiles(limitedFiles);
    setTrackTitles(limitedFiles.map((nextFile) => fileNameToTitle(nextFile.name)));
    if (nextFiles.length > MAX_TRACKS_PER_RELEASE) {
      setError(`EP and album uploads are limited to ${MAX_TRACKS_PER_RELEASE} tracks.`);
    } else {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("A title is required.");
      return;
    }

    if (mediaKind === "music" && isMultiTrackMusic) {
      if (files.length === 0) {
        setError(`Choose up to ${MAX_TRACKS_PER_RELEASE} audio files for this release.`);
        return;
      }

      if (files.length > MAX_TRACKS_PER_RELEASE) {
        setError(`EP and album uploads are limited to ${MAX_TRACKS_PER_RELEASE} tracks.`);
        return;
      }

      if (trackTitles.some((trackTitle) => !trackTitle.trim())) {
        setError("Every track needs a title.");
        return;
      }

      await onSubmit({
        mediaKind,
        releaseType,
        title: title.trim(),
        description: description.trim(),
        visibility,
        files,
        trackTitles: trackTitles.map((trackTitle) => trackTitle.trim()),
        coverArt,
      });
      return;
    }

    if (!file) {
      setError(`Choose a ${itemLabel} file to upload.`);
      return;
    }

    await onSubmit({
      mediaKind,
      releaseType: mediaKind === "music" ? releaseType : null,
      title: title.trim(),
      description: description.trim(),
      visibility,
      file,
      files: file ? [file] : [],
      trackTitles: title.trim() ? [title.trim()] : [],
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
        if (!isSubmitting) {
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
            <h3 className="text-2xl">upload {itemLabel}</h3>
            <p className="mt-2 text-sm text-gray-400">
              Add a {mediaKind} file and create the first metadata record for this item.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="border border-white/20 p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-50"
            aria-label="Close upload modal"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm text-gray-400">
              {isMultiTrackMusic ? "release title" : "title"}
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className="w-full border border-white/20 bg-transparent px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
              placeholder={
                isMultiTrackMusic ? "name this release" : `name this ${itemLabel}`
              }
              disabled={isSubmitting}
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
              placeholder="optional description"
              disabled={isSubmitting}
            />
          </div>

          {mediaKind === "music" && (
            <div>
              <label className="mb-2 block text-sm text-gray-400">release type</label>
              <select
                value={releaseType}
                onChange={(event) => setReleaseType(event.target.value)}
                className="w-full border border-white/20 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
                disabled={isSubmitting}
              >
                {MUSIC_RELEASE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                Tag this upload as a single, EP, or album for discovery and profile display.
              </p>
            </div>
          )}

          {mediaKind === "music" && (
            <div>
              <label className="mb-2 block text-sm text-gray-400">album art</label>
              <label className="flex cursor-pointer items-center gap-3 border border-dashed border-white/30 px-4 py-5 transition-colors hover:border-white/50">
                <Upload className="h-5 w-5 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {coverArt ? coverArt.name : "choose cover art image"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Optional. Use JPG, PNG, WEBP, GIF, or AVIF.
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isSubmitting}
                  onChange={(event) => setCoverArtDraft(event.target.files?.[0] ?? null)}
                />
              </label>
              {coverArtPreviewUrl && (
                <div className="mt-3 overflow-hidden border border-white/15 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                    cover preview
                  </div>
                  <img
                    src={coverArtPreviewUrl}
                    alt="Album art preview"
                    className="aspect-square w-full max-w-[12rem] object-cover"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-gray-400">visibility</label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
              className="w-full border border-white/20 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-white/60"
              disabled={isSubmitting}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">
              {isMultiTrackMusic ? "tracks" : "file"}
            </label>
            <label className="flex cursor-pointer items-center gap-3 border border-dashed border-white/30 px-4 py-5 transition-colors hover:border-white/50">
              <Upload className="h-5 w-5 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {isMultiTrackMusic
                    ? files.length > 0
                      ? `${files.length} tracks selected`
                      : `choose up to ${MAX_TRACKS_PER_RELEASE} tracks`
                    : file
                      ? file.name
                      : `choose a ${itemLabel} file`}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Accepted type: {ACCEPT_BY_KIND[mediaKind]}
                  {isMultiTrackMusic ? `, maximum ${MAX_TRACKS_PER_RELEASE} tracks` : ""}
                </p>
              </div>
              <input
                type="file"
                accept={ACCEPT_BY_KIND[mediaKind]}
                className="hidden"
                multiple={isMultiTrackMusic}
                disabled={isSubmitting}
                onChange={(event) => {
                  const selectedFiles = Array.from(event.target.files || []);
                  if (isMultiTrackMusic) {
                    handleMusicFileSelection(selectedFiles);
                    return;
                  }

                  setFile(selectedFiles[0] ?? null);
                }}
              />
            </label>
          </div>

          {isMultiTrackMusic && files.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm text-gray-400">track titles</label>
                <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                  {files.length}/{MAX_TRACKS_PER_RELEASE}
                </span>
              </div>
              <div className="space-y-3 border border-white/15 bg-white/[0.02] p-4">
                {files.map((selectedFile, index) => (
                  <div key={`${selectedFile.name}-${index}`} className="grid gap-2 md:grid-cols-[2rem_minmax(0,1fr)] md:items-center">
                    <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                      {index + 1}
                    </span>
                    <div>
                      <input
                        type="text"
                        value={trackTitles[index] || ""}
                        onChange={(event) =>
                          setTrackTitles((current) =>
                            current.map((trackTitle, trackIndex) =>
                              trackIndex === index ? event.target.value : trackTitle,
                            ),
                          )
                        }
                        maxLength={160}
                        className="w-full border border-white/20 bg-transparent px-4 py-2.5 text-white outline-none transition-colors focus:border-white/60"
                        disabled={isSubmitting}
                      />
                      <p className="mt-1 truncate text-xs text-gray-500">{selectedFile.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <motion.button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 border border-white/20 px-4 py-3 text-gray-300 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 border border-white/40 px-4 py-3 transition-colors hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              {isSubmitting ? "uploading..." : `upload ${itemLabel}`}
            </motion.button>
          </div>
        </form>
      </motion.div>

      {coverArtDraft ? (
        <ImageCropModal
          file={coverArtDraft}
          title="crop album art"
          description="Position the image inside the square frame. This fixed crop becomes the release cover everywhere in the archive."
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
