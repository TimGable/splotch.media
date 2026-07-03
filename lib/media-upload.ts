import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getMediaSocialSummary } from "@/lib/media-social";

export const MEDIA_KINDS = new Set(["music", "visual", "video"]);
export const MUSIC_RELEASE_TYPES = new Set(["single", "ep", "album"]);
export const VISIBILITY_LEVELS = new Set(["private", "invite_only", "public", "unlisted"]);
export const MAX_STANDARD_FILE_SIZE_BYTES = 250 * 1024 * 1024;
export const MAX_VIDEO_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const MAX_COVER_ART_SIZE_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
const IMAGE_PREVIEW_WIDTH = 900;
export const IMAGE_MIME_PREFIX = "image/";
export const BLOCKED_IMAGE_MIME_TYPES = new Set(["image/svg+xml"]);

export type UploadAssetInput = {
  clientId: string;
  role: "original" | "thumbnail";
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  trackNumber?: number | null;
};

export type PreparedUploadAsset = UploadAssetInput & {
  assetId: string;
  mediaItemId: string;
  bucket: string;
  objectKey: string;
  path: string;
  token: string;
  signedUrl: string;
};

export type CompletedUploadAsset = UploadAssetInput & {
  assetId: string;
  mediaItemId: string;
  bucket: string;
  objectKey: string;
};

type SignedUrlOptions = {
  transform?: {
    width: number;
    resize: "contain";
  };
};

type SignedUrlStorage = {
  createSignedUrl: (
    path: string,
    expiresIn: number,
    options?: SignedUrlOptions,
  ) => Promise<{
    data: { signedUrl?: string } | null;
    error: { message: string } | null;
  }>;
};

export function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed || "upload.bin";
}

export function isAllowedMimeType(mediaKind: string, mimeType: string) {
  if (mediaKind === "music") return mimeType.startsWith("audio/");
  if (mediaKind === "visual") return mimeType.startsWith("image/");
  if (mediaKind === "video") return mimeType.startsWith("video/");
  return false;
}

export function isAllowedCoverArtMimeType(mimeType: string) {
  return mimeType.startsWith(IMAGE_MIME_PREFIX) && !BLOCKED_IMAGE_MIME_TYPES.has(mimeType);
}

export function getMaxUploadSizeBytes(mediaKind: string) {
  return mediaKind === "video" ? MAX_VIDEO_FILE_SIZE_BYTES : MAX_STANDARD_FILE_SIZE_BYTES;
}

export function formatMaxUploadSizeLabel(mediaKind: string) {
  return mediaKind === "video" ? "1 GB" : "250 MB";
}

export function fileNameToTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatReleaseType(value: string) {
  if (value === "ep") return "EP";
  if (value === "album") return "Album";
  return "Single";
}

export function buildMultiTrackDescription(
  releaseTitle: string,
  releaseType: string,
  description: string,
) {
  const releaseLabel = formatReleaseType(releaseType);
  if (!description) return `From ${releaseLabel} "${releaseTitle}".`;
  return `From ${releaseLabel} "${releaseTitle}". ${description}`;
}

export function buildObjectKey(params: {
  userId: string;
  mediaItemId: string;
  assetId: string;
  fileName: string;
  variant?: string;
}) {
  // Object keys include user, media, and asset IDs so storage cleanup can target one archive item safely.
  return `u/${params.userId}/m/${params.mediaItemId}/a/${params.assetId}/v1/${params.variant || "original"}/${params.fileName}`;
}

export async function createSignedAssetPayload(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: {
    id: string;
    bucket: string;
    object_key: string;
    file_name: string | null;
    mime_type: string;
    file_size_bytes: number;
  },
  options: { previewWidth?: number } = {},
) {
  let assetUrl: string | null = null;
  const signedUrlOptions =
    options.previewWidth && asset.mime_type?.startsWith("image/")
      ? { transform: { width: options.previewWidth, resize: "contain" as const } }
      : undefined;
  // Private media stays in storage; clients only receive short-lived signed URLs for playback or previews.
  const storage = supabase.storage.from(asset.bucket) as unknown as SignedUrlStorage;
  const { data: signedData, error: signedError } = await storage.createSignedUrl(
    asset.object_key,
    SIGNED_URL_TTL_SECONDS,
    signedUrlOptions,
  );

  if (!signedError) {
    assetUrl = signedData?.signedUrl ?? null;
  }

  return {
    id: asset.id,
    fileName: asset.file_name,
    mimeType: asset.mime_type,
    fileSizeBytes: asset.file_size_bytes,
    url: assetUrl,
  };
}

export async function buildMediaItemResponse(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  item: {
    id: string;
    media_kind: string;
    collection_id?: string | null;
    music_release_type: string | null;
    title: string;
    description: string;
    visibility: string;
    state: string;
    created_at: string;
    published_at: string | null;
    duration_ms: number | null;
    primary_asset_id: string | null;
    trackNumber?: number | null;
  },
) {
  const { data: assets, error: assetsError } = await supabase
    .from("media_assets")
    .select("id, media_item_id, role, bucket, object_key, file_name, mime_type, file_size_bytes")
    .eq("media_item_id", item.id)
    .in("role", ["original", "thumbnail"]);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  let primaryAsset = null;
  let coverAsset = null;

  for (const asset of assets ?? []) {
    const signedAsset = await createSignedAssetPayload(supabase, asset);
    if (asset.id === item.primary_asset_id) {
      primaryAsset = signedAsset;
    }
    if (asset.role === "thumbnail") {
      coverAsset = signedAsset;
    }
  }

  return {
    id: item.id,
    mediaKind: item.media_kind,
    collectionId: item.collection_id ?? null,
    releaseType: item.music_release_type,
    title: item.title,
    description: item.description,
    visibility: item.visibility,
    state: item.state,
    createdAt: item.created_at,
    publishedAt: item.published_at,
    durationMs: item.duration_ms,
    trackNumber: item.trackNumber ?? null,
    asset: primaryAsset,
    coverAsset,
  };
}

export async function buildMediaListResponseItems(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
  mediaItems: Array<{
    id: string;
    collection_id: string | null;
    media_kind: string;
    music_release_type: string | null;
    title: string;
    description: string;
    visibility: string;
    state: string;
    created_at: string;
    published_at: string | null;
    duration_ms: number | null;
    primary_asset_id: string | null;
  }>,
) {
  const itemIds = mediaItems.map((item) => item.id);
  const socialSummaryByItemId = await getMediaSocialSummary(supabase, itemIds, userId);
  const primaryAssetsById = new Map<string, Record<string, unknown>>();
  const previewAssetsById = new Map<string, Record<string, unknown>>();
  const coverAssetsByItemId = new Map<string, Record<string, unknown>>();
  const collectionTitleById = new Map<string, string>();
  const trackNumberByItemId = new Map<string, number | null>();

  // Batch related lookups so list pages avoid a database round trip for every media card.
  if (itemIds.length > 0) {
    const { data: assets, error: assetsError } = await supabase
      .from("media_assets")
      .select("id, media_item_id, role, bucket, object_key, file_name, mime_type, file_size_bytes")
      .in("media_item_id", itemIds)
      .in("role", ["original", "thumbnail"]);

    if (assetsError) {
      throw new Error(assetsError.message);
    }

    for (const asset of assets ?? []) {
      const signedAsset = await createSignedAssetPayload(supabase, asset);
      if (asset.role === "original") {
        primaryAssetsById.set(asset.id, signedAsset);
        if (asset.mime_type?.startsWith("image/")) {
          previewAssetsById.set(
            asset.id,
            await createSignedAssetPayload(supabase, asset, { previewWidth: IMAGE_PREVIEW_WIDTH }),
          );
        }
      }
      if (asset.role === "thumbnail" && asset.media_item_id) {
        coverAssetsByItemId.set(
          asset.media_item_id,
          await createSignedAssetPayload(supabase, asset, { previewWidth: IMAGE_PREVIEW_WIDTH }),
        );
      }
    }

    const { data: trackRows, error: trackRowsError } = await supabase
      .from("music_track_details")
      .select("media_item_id, release_track_number")
      .in("media_item_id", itemIds);

    if (trackRowsError) {
      throw new Error(trackRowsError.message);
    }

    for (const trackRow of trackRows ?? []) {
      trackNumberByItemId.set(trackRow.media_item_id, trackRow.release_track_number ?? null);
    }
  }

  const collectionIds = [...new Set(mediaItems.map((item) => item.collection_id).filter(Boolean))];
  if (collectionIds.length > 0) {
    const { data: collections, error: collectionsError } = await supabase
      .from("media_collections")
      .select("id, title")
      .in("id", collectionIds);

    if (collectionsError) {
      throw new Error(collectionsError.message);
    }

    for (const collection of collections ?? []) {
      collectionTitleById.set(collection.id, collection.title);
    }
  }

  return mediaItems.map((item) => ({
    id: item.id,
    mediaKind: item.media_kind,
    collectionId: item.collection_id,
    collectionTitle: item.collection_id ? collectionTitleById.get(item.collection_id) || null : null,
    releaseType: item.music_release_type,
    title: item.title,
    description: item.description,
    visibility: item.visibility,
    state: item.state,
    createdAt: item.created_at,
    publishedAt: item.published_at,
    durationMs: item.duration_ms,
    trackNumber: trackNumberByItemId.get(item.id) ?? null,
    asset: item.primary_asset_id ? primaryAssetsById.get(item.primary_asset_id) ?? null : null,
    previewAsset: item.primary_asset_id ? previewAssetsById.get(item.primary_asset_id) ?? null : null,
    coverAsset: coverAssetsByItemId.get(item.id) ?? null,
    likes: socialSummaryByItemId.get(item.id)?.likes || 0,
    comments: socialSummaryByItemId.get(item.id)?.comments || 0,
    isLiked: socialSummaryByItemId.get(item.id)?.isLiked || false,
  }));
}
