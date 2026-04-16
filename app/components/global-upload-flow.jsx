"use client";

import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { UploadCategoryModal } from "./upload-category-modal";
import { UploadContentModal } from "./upload-content-modal";
import { UploadProgressModal } from "./upload-progress-modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadMediaDirectToSupabase } from "@/lib/upload-request";

export function GlobalUploadFlow({
  isOpen,
  categoryTags = [],
  onClose,
  onUploaded,
}) {
  const [uploadKind, setUploadKind] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const closeFlow = () => {
    if (isUploading) {
      return;
    }

    setUploadKind(null);
    onClose?.();
  };

  const handleSelectCategory = (mediaKind) => {
    setUploadKind(mediaKind);
  };

  const handleSubmit = async ({
    mediaKind,
    releaseType,
    title,
    description,
    visibility,
    file,
    files,
    trackTitles,
    coverArt,
  }) => {
    setIsUploading(true);
    setUploadProgress(1);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Session expired. Please sign in again before uploading.");
      }

      const payload = await uploadMediaDirectToSupabase({
        token: session.access_token,
        mediaKind,
        releaseType,
        title,
        description,
        visibility,
        file,
        files,
        trackTitles,
        coverArt,
        onProgress: setUploadProgress,
      });

      onUploaded?.(payload);
      setUploadKind(null);
      onClose?.();
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && !uploadKind ? (
        <UploadCategoryModal
          key="upload-category"
          categoryTags={categoryTags}
          onClose={closeFlow}
          onSelect={handleSelectCategory}
        />
      ) : null}

      {isOpen && uploadKind ? (
        <UploadContentModal
          key={`upload-content-${uploadKind}`}
          mediaKind={uploadKind}
          isSubmitting={isUploading}
          onClose={closeFlow}
          onSubmit={handleSubmit}
        />
      ) : null}

      {isUploading ? <UploadProgressModal key="upload-progress" progress={uploadProgress} /> : null}
    </AnimatePresence>
  );
}
