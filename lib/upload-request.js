import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function uploadFormDataWithProgress({ url, token, body, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const nextProgress = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(nextProgress);
    };

    xhr.onload = () => {
      let payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(payload);
        return;
      }

      if (xhr.status === 413) {
        reject(
          new Error(
            "This upload is too large for the deployed upload route. Vercel limits request bodies to about 4.5 MB, so media files need to upload directly to Supabase Storage.",
          ),
        );
        return;
      }

      reject(new Error(payload?.error || "Upload failed."));
    };

    xhr.onerror = () =>
      reject(
        new Error(
          "Upload failed before the server returned a response. If this file is larger than a few MB on the deployed site, it is probably hitting Vercel's request body limit.",
        ),
      );
    xhr.onabort = () => reject(new Error("Upload canceled."));

    xhr.send(body);
  });
}

function toUploadFileList({ mediaKind, releaseType, file, files, coverArt }) {
  const originals =
    mediaKind === "music" && releaseType && releaseType !== "single" ? files || [] : file ? [file] : [];
  const originalUploadFiles = originals.map((nextFile, index) => ({
    clientId: `original-${index}`,
    role: "original",
    file: nextFile,
    fileName: nextFile.name || `upload-${index + 1}.bin`,
    mimeType: nextFile.type || "application/octet-stream",
    fileSizeBytes: nextFile.size,
    trackNumber: index + 1,
  }));
  const uploadFiles = [...originalUploadFiles];

  if (mediaKind === "music" && coverArt) {
    for (const original of originalUploadFiles) {
      uploadFiles.push({
        clientId: `cover:${original.clientId}`,
        role: "thumbnail",
        file: coverArt,
        fileName: coverArt.name || "cover-art.bin",
        mimeType: coverArt.type || "application/octet-stream",
        fileSizeBytes: coverArt.size,
        trackNumber: original.trackNumber,
      });
    }
  }

  return uploadFiles;
}

function stripLocalFile(asset) {
  const { file: localFile, ...metadata } = asset;
  void localFile;
  return metadata;
}

function stripSignedUploadFields(asset) {
  const { signedUrl, token, path, ...metadata } = asset;
  void signedUrl;
  void token;
  void path;
  return metadata;
}

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }
  return payload;
}

export async function uploadMediaDirectToSupabase({
  token,
  mediaKind,
  releaseType,
  title,
  description,
  visibility,
  file,
  files,
  trackTitles,
  coverArt,
  onProgress,
}) {
  const uploadFiles = toUploadFileList({ mediaKind, releaseType, file, files, coverArt });
  if (uploadFiles.length === 0) {
    throw new Error("A file is required.");
  }

  onProgress?.(1);
  const initResponse = await fetch("/api/media/uploads/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mediaKind,
      releaseType,
      title,
      description,
      visibility,
      assets: uploadFiles.map(stripLocalFile),
    }),
  });
  const initPayload = await parseJsonResponse(initResponse, "Failed to prepare upload.");
  const targets = Array.isArray(initPayload.assets) ? initPayload.assets : [];
  const targetByClientId = new Map(targets.map((target) => [target.clientId, target]));
  const supabase = createSupabaseBrowserClient();

  for (const [index, uploadFile] of uploadFiles.entries()) {
    const target = targetByClientId.get(uploadFile.clientId);
    if (!target?.path || !target?.token) {
      throw new Error("Upload target was missing for one of the selected files.");
    }

    const { error } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, uploadFile.file, {
        contentType: uploadFile.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload ${uploadFile.fileName}: ${error.message}`);
    }

    const nextProgress = Math.max(2, Math.min(96, Math.round(((index + 1) / uploadFiles.length) * 88) + 5));
    onProgress?.(nextProgress);
  }

  const completeResponse = await fetch("/api/media/uploads/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mediaKind,
      releaseType,
      title,
      description,
      visibility,
      trackTitles,
      assets: targets.map(stripSignedUploadFields),
    }),
  });
  const completePayload = await parseJsonResponse(completeResponse, "Failed to finish upload.");
  onProgress?.(100);
  return completePayload;
}
