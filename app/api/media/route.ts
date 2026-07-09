import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ensureAppUser,
  ensureProfile,
  getAuthContext,
} from "@/lib/supabase/app-user";
import { getSupabaseStorageBucket } from "@/lib/supabase/config";
import { ensureStorageBucketExists } from "@/lib/supabase/storage";
import { getMediaSocialSummary } from "@/lib/media-social";
import { createMentionNotifications } from "@/lib/mentions";
import { createAppNotification } from "@/lib/notifications/app-notifications";

const MEDIA_KINDS = new Set(["music", "visual", "video"]);
const MUSIC_RELEASE_TYPES = new Set(["single", "ep", "album"]);
const VISIBILITY_LEVELS = new Set(["private", "invite_only", "public", "unlisted"]);
const MAX_STANDARD_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
const MAX_COVER_ART_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const IMAGE_PREVIEW_WIDTH = 900;
const IMAGE_MIME_PREFIX = "image/";
const BLOCKED_IMAGE_MIME_TYPES = new Set(["image/svg+xml"]);

type SignedUrlStorage = {
  createSignedUrl: (
    path: string,
    expiresIn: number,
    options?: { transform?: { width: number; resize: "contain" } },
  ) => Promise<{
    data: { signedUrl?: string } | null;
    error: { message: string } | null;
  }>;
};

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed || "upload.bin";
}

function isAllowedMimeType(mediaKind: string, mimeType: string) {
  if (mediaKind === "music") {
    return mimeType.startsWith("audio/");
  }

  if (mediaKind === "visual") {
    return mimeType.startsWith("image/");
  }

  if (mediaKind === "video") {
    return mimeType.startsWith("video/");
  }

  return false;
}

function buildObjectKey(params: {
  userId: string;
  mediaItemId: string;
  assetId: string;
  fileName: string;
  variant?: string;
}) {
  return `u/${params.userId}/m/${params.mediaItemId}/a/${params.assetId}/v1/${params.variant || "original"}/${params.fileName}`;
}

function isAllowedCoverArtMimeType(mimeType: string) {
  return mimeType.startsWith(IMAGE_MIME_PREFIX) && !BLOCKED_IMAGE_MIME_TYPES.has(mimeType);
}

function getMaxUploadSizeBytes(mediaKind: string) {
  return mediaKind === "video" ? MAX_VIDEO_FILE_SIZE_BYTES : MAX_STANDARD_FILE_SIZE_BYTES;
}

function formatMaxUploadSizeLabel(mediaKind: string) {
  return mediaKind === "video" ? "1 GB" : "250 MB";
}

function fileNameToTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReleaseType(value: string) {
  if (value === "ep") {
    return "EP";
  }

  if (value === "album") {
    return "Album";
  }

  return "Single";
}

function buildMultiTrackDescription(
  releaseTitle: string,
  releaseType: string,
  description: string,
) {
  const releaseLabel = formatReleaseType(releaseType);
  if (!description) {
    return `From ${releaseLabel} "${releaseTitle}".`;
  }

  return `From ${releaseLabel} "${releaseTitle}". ${description}`;
}

async function createSignedAssetPayload(
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

async function buildMediaItemResponse(
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
  let collectionTitle: string | null = null;

  for (const asset of assets ?? []) {
    const signedAsset = await createSignedAssetPayload(supabase, asset);
    if (asset.id === item.primary_asset_id) {
      primaryAsset = signedAsset;
    }
    if (asset.role === "thumbnail") {
      coverAsset = signedAsset;
    }
  }

  if (item.collection_id) {
    const { data: collection } = await supabase
      .from("media_collections")
      .select("title")
      .eq("id", item.collection_id)
      .maybeSingle();

    collectionTitle = collection?.title || null;
  }

  return {
    id: item.id,
    mediaKind: item.media_kind,
    collectionId: item.collection_id ?? null,
    collectionTitle,
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

async function createMusicUploadRecord(params: {
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  bucket: string;
  userId: string;
  mediaKind: string;
  releaseType: string | null;
  collectionId?: string | null;
  title: string;
  description: string;
  visibility: string;
  file: File;
  coverArt: File | null;
  trackNumber?: number | null;
}) {
  const {
    supabase,
    bucket,
    userId,
    mediaKind,
    releaseType,
    collectionId,
    title,
    description,
    visibility,
    file,
    coverArt,
    trackNumber,
  } = params;

  const mediaItemId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const safeFileName = sanitizeFileName(file.name || "upload.bin");
  const objectKey = buildObjectKey({
    userId,
    mediaItemId,
    assetId,
    fileName: safeFileName,
  });
  const uploadedObjectKeys = [objectKey];
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  let coverAssetId: string | null = null;

  // Storage and database writes are not one transaction, so every later failure
  // cleans up the object(s) already written. Not glamorous, very necessary.
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectKey, fileBuffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
  }

  const publishedAt = visibility === "private" ? null : new Date().toISOString();

  const { error: itemInsertError } = await supabase.from("media_items").insert({
    id: mediaItemId,
    owner_user_id: userId,
    media_kind: mediaKind,
    collection_id: collectionId ?? null,
    music_release_type: mediaKind === "music" ? releaseType : null,
    title,
    description,
    visibility,
    state: "ready",
    published_at: publishedAt,
  });

  if (itemInsertError) {
    await supabase.storage.from(bucket).remove(uploadedObjectKeys);
    throw new Error(itemInsertError.message);
  }

  const { error: assetInsertError } = await supabase.from("media_assets").insert({
    id: assetId,
    media_item_id: mediaItemId,
    owner_user_id: userId,
    role: "original",
    storage_provider: "supabase",
    bucket,
    object_key: objectKey,
    file_name: safeFileName,
    mime_type: file.type || "application/octet-stream",
    file_size_bytes: file.size,
  });

  if (assetInsertError) {
    await supabase.from("media_items").delete().eq("id", mediaItemId);
    await supabase.storage.from(bucket).remove(uploadedObjectKeys);
    throw new Error(assetInsertError.message);
  }

  const { error: itemUpdateError } = await supabase
    .from("media_items")
    .update({ primary_asset_id: assetId })
    .eq("id", mediaItemId);

  if (itemUpdateError) {
    await supabase.from("media_assets").delete().eq("id", assetId);
    await supabase.from("media_items").delete().eq("id", mediaItemId);
    await supabase.storage.from(bucket).remove(uploadedObjectKeys);
    throw new Error(itemUpdateError.message);
  }

  if (mediaKind === "music" && trackNumber) {
    const { error: trackDetailsError } = await supabase.from("music_track_details").insert({
      media_item_id: mediaItemId,
      release_track_number: trackNumber,
    });

    if (trackDetailsError) {
      await supabase.from("media_assets").delete().eq("id", assetId);
      await supabase.from("media_items").delete().eq("id", mediaItemId);
      await supabase.storage.from(bucket).remove(uploadedObjectKeys);
      throw new Error(trackDetailsError.message);
    }
  }

  if (coverArt instanceof File) {
    coverAssetId = crypto.randomUUID();
    const coverFileName = sanitizeFileName(coverArt.name || "cover-art.bin");
    const coverObjectKey = buildObjectKey({
      userId,
      mediaItemId,
      assetId: coverAssetId,
      fileName: coverFileName,
      variant: "thumbnail",
    });
    const coverBuffer = Buffer.from(await coverArt.arrayBuffer());

    const { error: coverUploadError } = await supabase.storage.from(bucket).upload(coverObjectKey, coverBuffer, {
      contentType: coverArt.type || "application/octet-stream",
      upsert: false,
    });

    if (coverUploadError) {
      await supabase.from("media_assets").delete().eq("id", assetId);
      await supabase.from("media_items").delete().eq("id", mediaItemId);
      await supabase.storage.from(bucket).remove(uploadedObjectKeys);
      throw new Error(`Failed to upload cover art to storage: ${coverUploadError.message}`);
    }

    uploadedObjectKeys.push(coverObjectKey);

    const { error: coverInsertError } = await supabase.from("media_assets").insert({
      id: coverAssetId,
      media_item_id: mediaItemId,
      owner_user_id: userId,
      role: "thumbnail",
      storage_provider: "supabase",
      bucket,
      object_key: coverObjectKey,
      file_name: coverFileName,
      mime_type: coverArt.type || "application/octet-stream",
      file_size_bytes: coverArt.size,
    });

    if (coverInsertError) {
      await supabase.from("media_assets").delete().eq("id", assetId);
      await supabase.from("media_items").delete().eq("id", mediaItemId);
      await supabase.storage.from(bucket).remove(uploadedObjectKeys);
      throw new Error(coverInsertError.message);
    }
  }

  const item = await buildMediaItemResponse(supabase, {
    id: mediaItemId,
    media_kind: mediaKind,
    collection_id: collectionId ?? null,
    music_release_type: mediaKind === "music" ? releaseType : null,
    title,
    description,
    visibility,
    state: "ready",
    created_at: new Date().toISOString(),
    published_at: publishedAt,
    duration_ms: null,
    primary_asset_id: assetId,
    trackNumber: trackNumber ?? null,
  });

  if (collectionId && coverAssetId) {
    await supabase
      .from("media_collections")
      .update({ cover_asset_id: coverAssetId })
      .eq("id", collectionId)
      .is("cover_asset_id", null);
  }

  return {
    item,
    mediaItemId,
    uploadedObjectKeys,
  };
}

async function replaceCoverArt(params: {
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  bucket: string;
  userId: string;
  mediaItemId: string;
  coverArt: File;
}) {
  const { supabase, bucket, userId, mediaItemId, coverArt } = params;

  const { data: existingCoverAssets, error: existingCoverAssetsError } = await supabase
    .from("media_assets")
    .select("id, bucket, object_key")
    .eq("media_item_id", mediaItemId)
    .eq("role", "thumbnail");

  if (existingCoverAssetsError) {
    throw new Error(existingCoverAssetsError.message);
  }

  const coverAssetId = crypto.randomUUID();
  const coverFileName = sanitizeFileName(coverArt.name || "cover-art.bin");
  const coverObjectKey = buildObjectKey({
    userId,
    mediaItemId,
    assetId: coverAssetId,
    fileName: coverFileName,
    variant: "thumbnail",
  });
  const coverBuffer = Buffer.from(await coverArt.arrayBuffer());

  const { error: coverUploadError } = await supabase.storage.from(bucket).upload(coverObjectKey, coverBuffer, {
    contentType: coverArt.type || "application/octet-stream",
    upsert: false,
  });

  if (coverUploadError) {
    throw new Error(`Failed to upload cover art to storage: ${coverUploadError.message}`);
  }

  const { error: coverInsertError } = await supabase.from("media_assets").insert({
    id: coverAssetId,
    media_item_id: mediaItemId,
    owner_user_id: userId,
    role: "thumbnail",
    storage_provider: "supabase",
    bucket,
    object_key: coverObjectKey,
    file_name: coverFileName,
    mime_type: coverArt.type || "application/octet-stream",
    file_size_bytes: coverArt.size,
  });

  if (coverInsertError) {
    await supabase.storage.from(bucket).remove([coverObjectKey]);
    throw new Error(coverInsertError.message);
  }

  const previousCoverAssets = existingCoverAssets ?? [];
  if (previousCoverAssets.length > 0) {
    const previousIds = previousCoverAssets.map((asset) => asset.id);
    await supabase.from("media_assets").delete().in("id", previousIds);

    const previousObjectsByBucket = new Map<string, string[]>();
    for (const asset of previousCoverAssets) {
      previousObjectsByBucket.set(asset.bucket, [
        ...(previousObjectsByBucket.get(asset.bucket) || []),
        asset.object_key,
      ]);
    }

    for (const [previousBucket, objectKeys] of previousObjectsByBucket.entries()) {
      if (objectKeys.length > 0) {
        await supabase.storage.from(previousBucket).remove(objectKeys);
      }
    }
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const supabase = createSupabaseServiceRoleClient();
    const { data: mediaItems, error: itemsError } = await supabase
      .from("media_items")
      .select(
        "id, collection_id, media_kind, music_release_type, title, description, visibility, state, created_at, published_at, duration_ms, primary_asset_id",
      )
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const items = mediaItems ?? [];
    const itemIds = items.map((item) => item.id);
    const socialSummaryByItemId = await getMediaSocialSummary(supabase, itemIds, userId);

    const primaryAssetsById = new Map<string, Record<string, unknown>>();
    const previewAssetsById = new Map<string, Record<string, unknown>>();
    const coverAssetsByItemId = new Map<string, Record<string, unknown>>();
    const collectionTitleById = new Map<string, string>();
    const trackNumberByItemId = new Map<string, number | null>();

    if (itemIds.length > 0) {
      const { data: assets, error: assetsError } = await supabase
        .from("media_assets")
        .select("id, media_item_id, role, bucket, object_key, file_name, mime_type, file_size_bytes")
        .in("media_item_id", itemIds)
        .in("role", ["original", "thumbnail"]);

      if (assetsError) {
        return NextResponse.json({ error: assetsError.message }, { status: 500 });
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
        return NextResponse.json({ error: trackRowsError.message }, { status: 500 });
      }

      for (const trackRow of trackRows ?? []) {
        trackNumberByItemId.set(trackRow.media_item_id, trackRow.release_track_number ?? null);
      }
    }

    const collectionIds = [...new Set(items.map((item) => item.collection_id).filter(Boolean))];
    if (collectionIds.length > 0) {
      const { data: collections, error: collectionsError } = await supabase
        .from("media_collections")
        .select("id, title")
        .in("id", collectionIds);

      if (collectionsError) {
        return NextResponse.json({ error: collectionsError.message }, { status: 500 });
      }

      for (const collection of collections ?? []) {
        collectionTitleById.set(collection.id, collection.title);
      }
    }

    return NextResponse.json({
      items: items.map((item) => ({
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
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const mediaKind = String(formData.get("mediaKind") || "").trim().toLowerCase();
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const releaseType = String(formData.get("releaseType") || "")
      .trim()
      .toLowerCase();
    const visibility = String(formData.get("visibility") || "public")
      .trim()
      .toLowerCase();
    const singleFile = formData.get("file");
    const uploadedFiles = formData.getAll("file").filter((value): value is File => value instanceof File);
    const trackTitles = formData
      .getAll("trackTitle")
      .map((value) => String(value || "").trim());
    const coverArt = formData.get("coverArt");

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

    const files =
      mediaKind === "music" && releaseType !== "single"
        ? uploadedFiles
        : singleFile instanceof File
          ? [singleFile]
          : uploadedFiles.slice(0, 1);

    if (files.length === 0) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (mediaKind !== "music" && files.length > 1) {
      return NextResponse.json({ error: "Only one file can be uploaded for this media type." }, { status: 400 });
    }

    if (mediaKind === "music" && releaseType === "single" && files.length > 1) {
      return NextResponse.json({ error: "Singles can only contain one track." }, { status: 400 });
    }

    for (const file of files) {
      if (file.size <= 0) {
        return NextResponse.json({ error: "One of the selected files is empty." }, { status: 400 });
      }

      const maxFileSizeBytes = getMaxUploadSizeBytes(mediaKind);
      if (file.size > maxFileSizeBytes) {
        return NextResponse.json(
          { error: `Files in the ${mediaKind} category must be ${formatMaxUploadSizeLabel(mediaKind)} or smaller.` },
          { status: 400 },
        );
      }

      if (!isAllowedMimeType(mediaKind, file.type || "")) {
        return NextResponse.json(
          { error: `One of the selected file types does not match the ${mediaKind} category.` },
          { status: 400 },
        );
      }
    }

    if (coverArt instanceof File) {
      if (mediaKind !== "music") {
        return NextResponse.json(
          { error: "Cover art is only supported for music uploads." },
          { status: 400 },
        );
      }

      if (coverArt.size <= 0) {
        return NextResponse.json({ error: "The selected cover art file is empty." }, { status: 400 });
      }

      if (coverArt.size > MAX_COVER_ART_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Cover art images must be 10 MB or smaller." },
          { status: 400 },
        );
      }

      if (!isAllowedCoverArtMimeType(coverArt.type || "")) {
        return NextResponse.json(
          { error: "Cover art must be a standard image format such as JPG, PNG, WEBP, GIF, or AVIF." },
          { status: 400 },
        );
      }
    }

    const bucket = getSupabaseStorageBucket();
    await ensureStorageBucketExists(bucket);
    const supabase = createSupabaseServiceRoleClient();
    if (mediaKind === "music" && releaseType !== "single") {
      if (trackTitles.length !== files.length) {
        return NextResponse.json({ error: "Every uploaded track needs a title." }, { status: 400 });
      }

      if (trackTitles.some((trackTitle) => !trackTitle)) {
        return NextResponse.json({ error: "Every uploaded track needs a title." }, { status: 400 });
      }
    }

    const createdMediaItemIds: string[] = [];
    const uploadedObjectKeysByBucket = new Map<string, string[]>();
    let createdCollectionId: string | null = null;

    try {
      const items = [];
      let collectionId: string | null = null;

      if (mediaKind === "music" && releaseType !== "single") {
        collectionId = crypto.randomUUID();
        const publishedAt = visibility === "private" ? null : new Date().toISOString();
        const { error: collectionInsertError } = await supabase.from("media_collections").insert({
          id: collectionId,
          owner_user_id: userId,
          media_kind: "music",
          title,
          description,
          visibility,
          state: "ready",
          published_at: publishedAt,
        });

        if (collectionInsertError) {
          throw new Error(collectionInsertError.message);
        }
        createdCollectionId = collectionId;
      }

      for (const [index, file] of files.entries()) {
        const trackTitle =
          mediaKind === "music"
            ? releaseType === "single"
              ? title
              : trackTitles[index] || fileNameToTitle(file.name || `track-${index + 1}`)
            : title;
        const itemDescription =
          mediaKind === "music" && releaseType !== "single"
            ? buildMultiTrackDescription(title, releaseType, description)
            : description;

        const created = await createMusicUploadRecord({
          supabase,
          bucket,
          userId,
          mediaKind,
          releaseType: mediaKind === "music" ? releaseType : null,
          collectionId,
          title: trackTitle,
          description: itemDescription,
          visibility,
          file,
          coverArt: coverArt instanceof File ? coverArt : null,
          trackNumber: mediaKind === "music" && releaseType !== "single" ? index + 1 : null,
        });

        createdMediaItemIds.push(created.mediaItemId);
        uploadedObjectKeysByBucket.set(bucket, [
          ...(uploadedObjectKeysByBucket.get(bucket) || []),
          ...created.uploadedObjectKeys,
        ]);
        items.push({
          ...created.item,
          collectionTitle: collectionId ? title : null,
        });
      }

      try {
        if (description) {
          await createMentionNotifications({
            supabase,
            actorUserId: userId,
            body: description,
            mediaItemId: items[0]?.id ?? null,
            data: {
              source: "media_description",
            },
          });
        }
      } catch (notificationError) {
        console.error("Failed to create media mention notifications:", notificationError);
      }

      return NextResponse.json(
        mediaKind === "music" && releaseType !== "single"
          ? { items }
          : { item: items[0] },
        { status: 201 },
      );
    } catch (creationError) {
      for (const mediaItemId of createdMediaItemIds) {
        await supabase.from("media_items").delete().eq("id", mediaItemId);
      }

      if (createdCollectionId) {
        await supabase.from("media_collections").delete().eq("id", createdCollectionId);
      }

      for (const [bucketName, objectKeys] of uploadedObjectKeysByBucket.entries()) {
        if (objectKeys.length > 0) {
          await supabase.storage.from(bucketName).remove(objectKeys);
        }
      }

      const message =
        creationError instanceof Error ? creationError.message : "Unexpected server error.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let payload: {
    id?: string;
    title?: string;
    description?: string;
    visibility?: string;
  } = {};
  let coverArt: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
    }

    payload = {
      id: String(formData.get("id") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      description: typeof formData.get("description") === "string" ? String(formData.get("description") || "").trim() : "",
      visibility: String(formData.get("visibility") || "").trim().toLowerCase(),
    };

    const nextCoverArt = formData.get("coverArt");
    coverArt = nextCoverArt instanceof File ? nextCoverArt : null;
  } else {
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId, isAdmin } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const mediaItemId = String(payload?.id || "").trim();
    const title = String(payload?.title || "").trim();
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const visibility = String(payload?.visibility || "").trim().toLowerCase();

    if (!mediaItemId) {
      return NextResponse.json({ error: "A media item id is required." }, { status: 400 });
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

    const supabase = createSupabaseServiceRoleClient();
    const { data: existingItem, error: existingItemError } = await supabase
      .from("media_items")
      .select(
        "id, owner_user_id, media_kind, music_release_type, title, description, visibility, state, created_at, published_at, duration_ms, primary_asset_id",
      )
      .eq("id", mediaItemId)
      .maybeSingle();

    if (existingItemError) {
      return NextResponse.json({ error: existingItemError.message }, { status: 500 });
    }

    if (!existingItem) {
      return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    }

    if (!isAdmin && existingItem.owner_user_id !== userId) {
      return NextResponse.json({ error: "You cannot edit this media item." }, { status: 403 });
    }

    if (coverArt instanceof File) {
      if (existingItem.media_kind !== "music") {
        return NextResponse.json(
          { error: "Cover art can only be updated for music uploads." },
          { status: 400 },
        );
      }

      if (coverArt.size <= 0) {
        return NextResponse.json({ error: "The selected cover art file is empty." }, { status: 400 });
      }

      if (coverArt.size > MAX_COVER_ART_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Cover art images must be 10 MB or smaller." },
          { status: 400 },
        );
      }

      if (!isAllowedCoverArtMimeType(coverArt.type || "")) {
        return NextResponse.json(
          { error: "Cover art must be a standard image format such as JPG, PNG, WEBP, GIF, or AVIF." },
          { status: 400 },
        );
      }
    }

    const publishedAt = visibility === "private" ? null : existingItem.published_at || new Date().toISOString();

    const { error: updateError } = await supabase
      .from("media_items")
      .update({
        title,
        description,
        visibility,
        published_at: publishedAt,
      })
      .eq("id", mediaItemId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (coverArt instanceof File) {
      const bucket = getSupabaseStorageBucket();
      await ensureStorageBucketExists(bucket);
      await replaceCoverArt({
        supabase,
        bucket,
        userId: existingItem.owner_user_id,
        mediaItemId,
        coverArt,
      });
    }

    const { data: updatedItem, error: updatedItemError } = await supabase
      .from("media_items")
      .select(
        "id, owner_user_id, media_kind, music_release_type, title, description, visibility, state, created_at, published_at, duration_ms, primary_asset_id",
      )
      .eq("id", mediaItemId)
      .single();

    if (updatedItemError) {
      return NextResponse.json({ error: updatedItemError.message }, { status: 500 });
    }

    if (isAdmin && existingItem.owner_user_id !== userId) {
      try {
        await createAppNotification({
          recipientUserId: existingItem.owner_user_id,
          actorUserId: userId,
          type: "mention",
          mediaItemId,
          data: {
            source: "moderation",
            action: "updated",
            title,
            bodyPreview: `moderation updated your post "${title}".`,
          },
        });
      } catch (notificationError) {
        console.error("Failed to create moderation update notification:", notificationError);
      }
    }

    try {
      if (description) {
        await createMentionNotifications({
          supabase,
          actorUserId: userId,
          body: description,
          mediaItemId,
          data: {
            source: "media_description",
          },
        });
      }
    } catch (notificationError) {
      console.error("Failed to create media mention notifications:", notificationError);
    }

    const item = await buildMediaItemResponse(supabase, updatedItem);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId, isAdmin } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const { searchParams } = new URL(request.url);
    const mediaItemId = searchParams.get("id")?.trim();
    const deleteScope = searchParams.get("scope")?.trim().toLowerCase();

    if (!mediaItemId) {
      return NextResponse.json({ error: "A media item id is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: mediaItem, error: mediaItemError } = await supabase
      .from("media_items")
      .select("id, owner_user_id, collection_id, music_release_type, title")
      .eq("id", mediaItemId)
      .maybeSingle();

    if (mediaItemError) {
      return NextResponse.json({ error: mediaItemError.message }, { status: 500 });
    }

    if (!mediaItem) {
      return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    }

    if (!isAdmin && mediaItem.owner_user_id !== userId) {
      return NextResponse.json({ error: "You cannot delete this media item." }, { status: 403 });
    }

    let mediaItemsToDelete = [mediaItem];
    const shouldDeleteRelease =
      deleteScope === "release" &&
      mediaItem.collection_id &&
      mediaItem.music_release_type &&
      mediaItem.music_release_type !== "single";

    if (shouldDeleteRelease) {
      const { data: releaseItems, error: releaseItemsError } = await supabase
        .from("media_items")
        .select("id, owner_user_id, collection_id, music_release_type, title")
        .eq("collection_id", mediaItem.collection_id);

      if (releaseItemsError) {
        return NextResponse.json({ error: releaseItemsError.message }, { status: 500 });
      }

      if (!releaseItems?.length) {
        return NextResponse.json({ error: "Release tracks not found." }, { status: 404 });
      }

      if (!isAdmin && releaseItems.some((item) => item.owner_user_id !== userId)) {
        return NextResponse.json({ error: "You cannot delete this release." }, { status: 403 });
      }

      mediaItemsToDelete = releaseItems;
    }

    const mediaItemIdsToDelete = mediaItemsToDelete.map((item) => item.id);

    const { data: assets, error: assetsError } = await supabase
      .from("media_assets")
      .select("id, bucket, object_key")
      .in("media_item_id", mediaItemIdsToDelete);

    if (assetsError) {
      return NextResponse.json({ error: assetsError.message }, { status: 500 });
    }

    const bucketsToObjectKeys = new Map<string, string[]>();
    for (const asset of assets ?? []) {
      if (!bucketsToObjectKeys.has(asset.bucket)) {
        bucketsToObjectKeys.set(asset.bucket, []);
      }
      bucketsToObjectKeys.get(asset.bucket)?.push(asset.object_key);
    }

    for (const [bucket, objectKeys] of bucketsToObjectKeys.entries()) {
      if (objectKeys.length > 0) {
        await supabase.storage.from(bucket).remove(objectKeys);
      }
    }

    const { error: deleteError } = await supabase.from("media_items").delete().in("id", mediaItemIdsToDelete);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (shouldDeleteRelease && mediaItem.collection_id) {
      await supabase.from("media_collections").delete().eq("id", mediaItem.collection_id);
    }

    if (isAdmin && mediaItem.owner_user_id !== userId) {
      try {
        const deletedTitle =
          shouldDeleteRelease && mediaItemsToDelete.length > 1
            ? mediaItem.title || "your release"
            : mediaItem.title || "your post";
        await createAppNotification({
          recipientUserId: mediaItem.owner_user_id,
          actorUserId: userId,
          type: "mention",
          mediaItemId: null,
          data: {
            source: "moderation",
            action: "deleted",
            title: deletedTitle,
            bodyPreview: `moderation deleted your post "${deletedTitle}".`,
          },
        });
      } catch (notificationError) {
        console.error("Failed to create moderation delete notification:", notificationError);
      }
    }

    return NextResponse.json({
      deleted: true,
      id: mediaItemId,
      ids: mediaItemIdsToDelete,
      collectionId: shouldDeleteRelease ? mediaItem.collection_id : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
