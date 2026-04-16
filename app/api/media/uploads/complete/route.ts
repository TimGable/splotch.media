import { NextResponse } from "next/server";
import { createMentionNotifications } from "@/lib/mentions";
import { ensureAppUser, ensureProfile, getAuthContext } from "@/lib/supabase/app-user";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  CompletedUploadAsset,
  MEDIA_KINDS,
  MUSIC_RELEASE_TYPES,
  VISIBILITY_LEVELS,
  buildMediaItemResponse,
  buildMultiTrackDescription,
  fileNameToTitle,
  formatMaxUploadSizeLabel,
  getMaxUploadSizeBytes,
  isAllowedCoverArtMimeType,
  isAllowedMimeType,
  type CompletedUploadAsset as CompletedUploadAssetType,
} from "@/lib/media-upload";

type CompletePayload = {
  mediaKind?: unknown;
  releaseType?: unknown;
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  trackTitles?: unknown;
  assets?: unknown;
};

function normalizeAsset(value: unknown): CompletedUploadAssetType | null {
  if (!value || typeof value !== "object") return null;
  const asset = value as Record<string, unknown>;
  const clientId = typeof asset.clientId === "string" ? asset.clientId.trim() : "";
  const role = asset.role === "original" || asset.role === "thumbnail" ? asset.role : null;
  const fileName = typeof asset.fileName === "string" ? asset.fileName.trim() : "";
  const mimeType = typeof asset.mimeType === "string" ? asset.mimeType.trim().toLowerCase() : "";
  const fileSizeBytes = Number(asset.fileSizeBytes);
  const trackNumber = asset.trackNumber == null ? null : Number(asset.trackNumber);
  const assetId = typeof asset.assetId === "string" ? asset.assetId.trim() : "";
  const mediaItemId = typeof asset.mediaItemId === "string" ? asset.mediaItemId.trim() : "";
  const bucket = typeof asset.bucket === "string" ? asset.bucket.trim() : "";
  const objectKey = typeof asset.objectKey === "string" ? asset.objectKey.trim() : "";

  if (
    !clientId ||
    !role ||
    !fileName ||
    !mimeType ||
    !Number.isFinite(fileSizeBytes) ||
    !assetId ||
    !mediaItemId ||
    !bucket ||
    !objectKey
  ) {
    return null;
  }

  return {
    clientId,
    role,
    fileName,
    mimeType,
    fileSizeBytes,
    trackNumber: Number.isFinite(trackNumber) ? trackNumber : null,
    assetId,
    mediaItemId,
    bucket,
    objectKey,
  };
}

async function assertUploadedObjectExists(asset: CompletedUploadAsset) {
  const supabase = createSupabaseServiceRoleClient();
  const parentPath = asset.objectKey.split("/").slice(0, -1).join("/");
  const fileName = asset.objectKey.split("/").pop();
  const { data, error } = await supabase.storage.from(asset.bucket).list(parentPath, {
    limit: 100,
    search: fileName,
  });

  if (error) {
    throw new Error(`Failed to verify uploaded object: ${error.message}`);
  }

  if (!data?.some((entry) => entry.name === fileName)) {
    throw new Error(`Uploaded file was not found in storage: ${asset.fileName}`);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const payload = (await request.json().catch(() => null)) as CompletePayload | null;
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const mediaKind = String(payload.mediaKind || "").trim().toLowerCase();
    const releaseType = String(payload.releaseType || "").trim().toLowerCase();
    const title = String(payload.title || "").trim();
    const description = String(payload.description || "").trim();
    const visibility = String(payload.visibility || "public").trim().toLowerCase();
    const trackTitles = Array.isArray(payload.trackTitles)
      ? payload.trackTitles.map((value) => String(value || "").trim())
      : [];
    const assets = Array.isArray(payload.assets)
      ? payload.assets.map(normalizeAsset).filter((asset): asset is CompletedUploadAssetType => Boolean(asset))
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

    if (mediaKind === "music" && releaseType !== "single") {
      if (trackTitles.length !== originalAssets.length || trackTitles.some((trackTitle) => !trackTitle)) {
        return NextResponse.json({ error: "Every uploaded track needs a title." }, { status: 400 });
      }
    }

    for (const asset of assets) {
      if (!asset.objectKey.startsWith(`u/${userId}/`)) {
        return NextResponse.json({ error: "Upload object key does not match the signed-in user." }, { status: 400 });
      }
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

    for (const asset of coverAssets) {
      if (mediaKind !== "music") {
        return NextResponse.json({ error: "Cover art is only supported for music uploads." }, { status: 400 });
      }

      if (!isAllowedCoverArtMimeType(asset.mimeType)) {
        return NextResponse.json(
          { error: "Cover art must be a standard image format such as JPG, PNG, WEBP, GIF, or AVIF." },
          { status: 400 },
        );
      }
    }

    for (const asset of assets) {
      await assertUploadedObjectExists(asset);
    }

    const supabase = createSupabaseServiceRoleClient();
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

      for (const [index, originalAsset] of originalAssets.entries()) {
        const trackTitle =
          mediaKind === "music"
            ? releaseType === "single"
              ? title
              : trackTitles[index] || fileNameToTitle(originalAsset.fileName || `track-${index + 1}`)
            : title;
        const itemDescription =
          mediaKind === "music" && releaseType !== "single"
            ? buildMultiTrackDescription(title, releaseType, description)
            : description;
        const publishedAt = visibility === "private" ? null : new Date().toISOString();
        const coverAsset = coverAssets.find((asset) => asset.mediaItemId === originalAsset.mediaItemId) || null;

        const { error: itemInsertError } = await supabase.from("media_items").insert({
          id: originalAsset.mediaItemId,
          owner_user_id: userId,
          media_kind: mediaKind,
          collection_id: collectionId,
          music_release_type: mediaKind === "music" ? releaseType : null,
          title: trackTitle,
          description: itemDescription,
          visibility,
          state: "ready",
          published_at: publishedAt,
        });

        if (itemInsertError) {
          throw new Error(itemInsertError.message);
        }

        createdMediaItemIds.push(originalAsset.mediaItemId);
        uploadedObjectKeysByBucket.set(originalAsset.bucket, [
          ...(uploadedObjectKeysByBucket.get(originalAsset.bucket) || []),
          originalAsset.objectKey,
        ]);

        const { error: assetInsertError } = await supabase.from("media_assets").insert({
          id: originalAsset.assetId,
          media_item_id: originalAsset.mediaItemId,
          owner_user_id: userId,
          role: "original",
          storage_provider: "supabase",
          bucket: originalAsset.bucket,
          object_key: originalAsset.objectKey,
          file_name: originalAsset.fileName,
          mime_type: originalAsset.mimeType,
          file_size_bytes: originalAsset.fileSizeBytes,
        });

        if (assetInsertError) {
          throw new Error(assetInsertError.message);
        }

        const { error: itemUpdateError } = await supabase
          .from("media_items")
          .update({ primary_asset_id: originalAsset.assetId })
          .eq("id", originalAsset.mediaItemId);

        if (itemUpdateError) {
          throw new Error(itemUpdateError.message);
        }

        if (mediaKind === "music" && releaseType !== "single") {
          const { error: trackDetailsError } = await supabase.from("music_track_details").insert({
            media_item_id: originalAsset.mediaItemId,
            release_track_number: index + 1,
          });

          if (trackDetailsError) {
            throw new Error(trackDetailsError.message);
          }
        }

        if (coverAsset) {
          uploadedObjectKeysByBucket.set(coverAsset.bucket, [
            ...(uploadedObjectKeysByBucket.get(coverAsset.bucket) || []),
            coverAsset.objectKey,
          ]);

          const { error: coverInsertError } = await supabase.from("media_assets").insert({
            id: coverAsset.assetId,
            media_item_id: originalAsset.mediaItemId,
            owner_user_id: userId,
            role: "thumbnail",
            storage_provider: "supabase",
            bucket: coverAsset.bucket,
            object_key: coverAsset.objectKey,
            file_name: coverAsset.fileName,
            mime_type: coverAsset.mimeType,
            file_size_bytes: coverAsset.fileSizeBytes,
          });

          if (coverInsertError) {
            throw new Error(coverInsertError.message);
          }

          if (collectionId) {
            await supabase
              .from("media_collections")
              .update({ cover_asset_id: coverAsset.assetId })
              .eq("id", collectionId)
              .is("cover_asset_id", null);
          }
        }

        const item = await buildMediaItemResponse(supabase, {
          id: originalAsset.mediaItemId,
          media_kind: mediaKind,
          collection_id: collectionId,
          music_release_type: mediaKind === "music" ? releaseType : null,
          title: trackTitle,
          description: itemDescription,
          visibility,
          state: "ready",
          created_at: new Date().toISOString(),
          published_at: publishedAt,
          duration_ms: null,
          primary_asset_id: originalAsset.assetId,
          trackNumber: mediaKind === "music" && releaseType !== "single" ? index + 1 : null,
        });

        items.push({
          ...item,
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
        mediaKind === "music" && releaseType !== "single" ? { items } : { item: items[0] },
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

      const message = creationError instanceof Error ? creationError.message : "Unexpected server error.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
