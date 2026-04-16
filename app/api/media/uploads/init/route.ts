import { NextResponse } from "next/server";
import { getSupabaseStorageBucket } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ensureAppUser, ensureProfile, getAuthContext } from "@/lib/supabase/app-user";
import { ensureStorageBucketExists } from "@/lib/supabase/storage";
import {
  BLOCKED_IMAGE_MIME_TYPES,
  MAX_COVER_ART_SIZE_BYTES,
  MEDIA_KINDS,
  MUSIC_RELEASE_TYPES,
  VISIBILITY_LEVELS,
  buildObjectKey,
  formatMaxUploadSizeLabel,
  getMaxUploadSizeBytes,
  isAllowedCoverArtMimeType,
  isAllowedMimeType,
  sanitizeFileName,
  type PreparedUploadAsset,
  type UploadAssetInput,
} from "@/lib/media-upload";

type InitPayload = {
  mediaKind?: unknown;
  releaseType?: unknown;
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  assets?: unknown;
};

function normalizeAsset(value: unknown): UploadAssetInput | null {
  if (!value || typeof value !== "object") return null;
  const asset = value as Record<string, unknown>;
  const clientId = typeof asset.clientId === "string" ? asset.clientId.trim() : "";
  const role = asset.role === "original" || asset.role === "thumbnail" ? asset.role : null;
  const fileName = typeof asset.fileName === "string" ? asset.fileName.trim() : "";
  const mimeType = typeof asset.mimeType === "string" ? asset.mimeType.trim().toLowerCase() : "";
  const fileSizeBytes = Number(asset.fileSizeBytes);
  const trackNumber = asset.trackNumber == null ? null : Number(asset.trackNumber);

  if (!clientId || !role || !fileName || !mimeType || !Number.isFinite(fileSizeBytes)) {
    return null;
  }

  return {
    clientId,
    role,
    fileName,
    mimeType,
    fileSizeBytes,
    trackNumber: Number.isFinite(trackNumber) ? trackNumber : null,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const payload = (await request.json().catch(() => null)) as InitPayload | null;
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const mediaKind = String(payload.mediaKind || "").trim().toLowerCase();
    const releaseType = String(payload.releaseType || "").trim().toLowerCase();
    const title = String(payload.title || "").trim();
    const description = String(payload.description || "").trim();
    const visibility = String(payload.visibility || "public").trim().toLowerCase();
    const assets = Array.isArray(payload.assets)
      ? payload.assets.map(normalizeAsset).filter((asset): asset is UploadAssetInput => Boolean(asset))
      : [];

    if (!MEDIA_KINDS.has(mediaKind)) {
      return NextResponse.json({ error: "Invalid media kind." }, { status: 400 });
    }

    if (!title || title.length > 160) {
      return NextResponse.json(
        { error: "Title is required and must be 160 characters or fewer." },
        { status: 400 },
      );
    }

    if (description.length > 4000) {
      return NextResponse.json(
        { error: "Description must be 4000 characters or fewer." },
        { status: 400 },
      );
    }

    if (!VISIBILITY_LEVELS.has(visibility)) {
      return NextResponse.json({ error: "Invalid visibility level." }, { status: 400 });
    }

    if (mediaKind === "music" && !MUSIC_RELEASE_TYPES.has(releaseType)) {
      return NextResponse.json(
        { error: "Music uploads must specify single, EP, or album." },
        { status: 400 },
      );
    }

    const originalAssets = assets.filter((asset) => asset.role === "original");
    const coverAssets = assets.filter((asset) => asset.role === "thumbnail");
    if (originalAssets.length === 0) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (mediaKind !== "music" && originalAssets.length > 1) {
      return NextResponse.json({ error: "Only one file can be uploaded for this media type." }, { status: 400 });
    }

    if (mediaKind === "music" && releaseType === "single" && originalAssets.length > 1) {
      return NextResponse.json({ error: "Singles can only contain one track." }, { status: 400 });
    }

    for (const asset of originalAssets) {
      if (asset.fileSizeBytes <= 0) {
        return NextResponse.json({ error: "One of the selected files is empty." }, { status: 400 });
      }

      const maxFileSizeBytes = getMaxUploadSizeBytes(mediaKind);
      if (asset.fileSizeBytes > maxFileSizeBytes) {
        return NextResponse.json(
          { error: `Files in the ${mediaKind} category must be ${formatMaxUploadSizeLabel(mediaKind)} or smaller.` },
          { status: 400 },
        );
      }

      if (!isAllowedMimeType(mediaKind, asset.mimeType)) {
        return NextResponse.json(
          { error: `One of the selected file types does not match the ${mediaKind} category.` },
          { status: 400 },
        );
      }
    }

    if (coverAssets.length > 0 && mediaKind !== "music") {
      return NextResponse.json(
        { error: "Cover art is only supported for music uploads." },
        { status: 400 },
      );
    }

    for (const asset of coverAssets) {
      if (asset.fileSizeBytes <= 0) {
        return NextResponse.json({ error: "The selected cover art file is empty." }, { status: 400 });
      }

      if (asset.fileSizeBytes > MAX_COVER_ART_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Cover art images must be 10 MB or smaller." },
          { status: 400 },
        );
      }

      if (!isAllowedCoverArtMimeType(asset.mimeType)) {
        const svgMessage = BLOCKED_IMAGE_MIME_TYPES.has(asset.mimeType) ? " SVG is not supported." : "";
        return NextResponse.json(
          { error: `Cover art must be a standard image format such as JPG, PNG, WEBP, GIF, or AVIF.${svgMessage}` },
          { status: 400 },
        );
      }
    }

    const bucket = getSupabaseStorageBucket();
    await ensureStorageBucketExists(bucket);
    const supabase = createSupabaseServiceRoleClient();
    const preparedAssets: PreparedUploadAsset[] = [];
    const mediaItemIdByClientId = new Map<string, string>();

    for (const asset of originalAssets) {
      mediaItemIdByClientId.set(asset.clientId, crypto.randomUUID());
    }

    for (const asset of assets) {
      const mediaItemId =
        asset.role === "thumbnail" && asset.clientId.startsWith("cover:")
          ? mediaItemIdByClientId.get(asset.clientId.slice("cover:".length))
          : mediaItemIdByClientId.get(asset.clientId);

      if (!mediaItemId) {
        return NextResponse.json({ error: "Cover art did not match an uploaded track." }, { status: 400 });
      }

      const assetId = crypto.randomUUID();
      const objectKey = buildObjectKey({
        userId,
        mediaItemId,
        assetId,
        fileName: sanitizeFileName(asset.fileName),
        variant: asset.role === "thumbnail" ? "thumbnail" : "original",
      });
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(objectKey);

      if (signedError || !signedData?.token || !signedData?.signedUrl) {
        return NextResponse.json(
          { error: `Failed to prepare upload URL: ${signedError?.message || "Unknown error."}` },
          { status: 500 },
        );
      }

      preparedAssets.push({
        ...asset,
        assetId,
        mediaItemId,
        bucket,
        objectKey,
        path: signedData.path || objectKey,
        token: signedData.token,
        signedUrl: signedData.signedUrl,
      });
    }

    return NextResponse.json({
      uploadId: crypto.randomUUID(),
      bucket,
      assets: preparedAssets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
