import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MIME_TYPE_BY_EXTENSION = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  alac: "audio/alac",
  caf: "audio/x-caf",
  ogg: "audio/ogg",
  opus: "audio/opus",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
  hevc: "video/hevc",
};

function inferMimeType(file) {
  if (file?.type) {
    return file.type;
  }

  const fileName = file?.name || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
  return MIME_TYPE_BY_EXTENSION[extension] || "application/octet-stream";
}

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
    mimeType: inferMimeType(nextFile),
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
        mimeType: inferMimeType(coverArt),
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

const MAX_PARALLEL_UPLOADS = 3;

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
  let completedUploads = 0;

  const uploadOneFile = async (uploadFile) => {
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

    completedUploads += 1;
    const nextProgress = Math.max(2, Math.min(96, Math.round((completedUploads / uploadFiles.length) * 88) + 5));
    onProgress?.(nextProgress);
  };

  for (let index = 0; index < uploadFiles.length; index += MAX_PARALLEL_UPLOADS) {
    const batch = uploadFiles.slice(index, index + MAX_PARALLEL_UPLOADS);
    await Promise.all(batch.map((uploadFile) => uploadOneFile(uploadFile)));
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
