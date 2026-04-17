import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { attachPublicMediaSlugs } from "@/lib/media-slugs";
import { getMediaSocialSummary } from "@/lib/media-social";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const IMAGE_PREVIEW_WIDTH = 900;
const LIKE_PREVIEW_WIDTH = 320;

type VisibilityLevel = "public" | "unlisted";

type PublicLikedTrack = {
  id: string;
  title: string;
  mediaKind: string;
  releaseType: string | null;
  slug: string;
  likedAt: string | null;
  coverArtUrl: string | null;
  previewUrl: string | null;
  artist: {
    username: string;
    displayName: string;
  };
};

type RawMediaItem = {
  id: string;
  media_kind: string;
  collection_id: string | null;
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
};

async function createSignedAssetPayload(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: {
    id: string;
    media_item_id: string | null;
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
  const { data: signedData, error: signedError } = await (supabase.storage.from(asset.bucket) as any)
    .createSignedUrl(asset.object_key, SIGNED_URL_TTL_SECONDS, signedUrlOptions);

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

async function loadProfileBase(username: string) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, bio, avatar_asset_id")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    return null;
  }

  const [
    { data: userRecord, error: userRecordError },
    { data: categories, error: categoriesError },
    { count: followerCount, error: followerCountError },
    { count: followingCount, error: followingCountError },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("auth_user_id, is_admin, is_moderator")
      .eq("id", profile.user_id)
      .maybeSingle(),
    supabase.from("profile_categories").select("category").eq("user_id", profile.user_id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("artist_user_id", profile.user_id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_user_id", profile.user_id),
  ]);

  if (userRecordError) {
    throw new Error(userRecordError.message);
  }

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  if (followerCountError) {
    throw new Error(followerCountError.message);
  }

  if (followingCountError) {
    throw new Error(followingCountError.message);
  }

  let avatarUrl: string | null = null;
  if (profile.avatar_asset_id) {
    const { data: avatarAsset, error: avatarAssetError } = await supabase
      .from("media_assets")
      .select("id, media_item_id, bucket, object_key, file_name, mime_type, file_size_bytes")
      .eq("id", profile.avatar_asset_id)
      .maybeSingle();

    if (avatarAssetError) {
      throw new Error(avatarAssetError.message);
    }

    if (avatarAsset?.bucket && avatarAsset.object_key) {
      avatarUrl = (await createSignedAssetPayload(supabase, avatarAsset)).url;
    }
  }

  return {
    supabase,
    profile: {
      userId: profile.user_id,
      authUserId: userRecord?.auth_user_id || null,
      isAdmin: Boolean(userRecord?.is_admin),
      isModerator: Boolean(userRecord?.is_moderator),
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl,
      categoryTags: (categories ?? []).map((row) => row.category),
      followerCount: followerCount || 0,
      followingCount: followingCount || 0,
    },
  };
}

async function loadMediaItems(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
  visibility: VisibilityLevel[],
) {
  const { data: mediaItems, error: mediaItemsError } = await supabase
    .from("media_items")
    .select(
      "id, collection_id, media_kind, music_release_type, title, description, visibility, state, created_at, published_at, duration_ms, primary_asset_id",
    )
    .eq("owner_user_id", userId)
    .eq("state", "ready")
    .in("visibility", visibility)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (mediaItemsError) {
    throw new Error(mediaItemsError.message);
  }

  const itemIds = (mediaItems ?? []).map((item) => item.id);
  const socialSummaryByItemId = await getMediaSocialSummary(supabase, itemIds);
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

  const collectionIds = [...new Set((mediaItems ?? []).map((item) => item.collection_id).filter(Boolean))];
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

  return attachPublicMediaSlugs(
    (mediaItems ?? []).map((item: RawMediaItem) => ({
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
      isLiked: false,
    })),
  );
}

async function loadLikedTracks(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
): Promise<PublicLikedTrack[]> {
  const { data: likedRows, error: likedRowsError } = await supabase
    .from("media_likes")
    .select("media_item_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (likedRowsError) {
    throw new Error(likedRowsError.message);
  }

  const mediaItemIds = (likedRows ?? []).map((row) => row.media_item_id).filter(Boolean);
  if (mediaItemIds.length === 0) {
    return [];
  }

  const { data: mediaItems, error: mediaItemsError } = await supabase
    .from("media_items")
    .select(
      "id, owner_user_id, collection_id, music_release_type, title, media_kind, visibility, state, published_at, primary_asset_id",
    )
    .in("id", mediaItemIds)
    .eq("visibility", "public")
    .eq("state", "ready");

  if (mediaItemsError) {
    throw new Error(mediaItemsError.message);
  }

  const filteredItems = mediaItems ?? [];
  if (filteredItems.length === 0) {
    return [];
  }

  const ownerIds = [...new Set(filteredItems.map((item) => item.owner_user_id).filter(Boolean))];
  const ownerProfilesById = new Map<string, { username: string; displayName: string }>();
  if (ownerIds.length > 0) {
    const { data: ownerProfiles, error: ownerProfilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name")
      .in("user_id", ownerIds);

    if (ownerProfilesError) {
      throw new Error(ownerProfilesError.message);
    }

    for (const ownerProfile of ownerProfiles ?? []) {
      ownerProfilesById.set(ownerProfile.user_id, {
        username: ownerProfile.username,
        displayName: ownerProfile.display_name,
      });
    }
  }

  const coverAssetsByItemId = new Map<string, Record<string, unknown>>();
  const originalAssetsByItemId = new Map<string, Record<string, unknown>>();

  if (filteredItems.length > 0) {
    const { data: coverAssets, error: coverAssetsError } = await supabase
      .from("media_assets")
      .select("id, media_item_id, role, bucket, object_key, file_name, mime_type, file_size_bytes")
      .in("media_item_id", filteredItems.map((item) => item.id))
      .in("role", ["thumbnail", "original"]);

    if (coverAssetsError) {
      throw new Error(coverAssetsError.message);
    }

    for (const asset of coverAssets ?? []) {
      if (!asset.media_item_id) {
        continue;
      }

      const signedAsset = await createSignedAssetPayload(supabase, asset, { previewWidth: LIKE_PREVIEW_WIDTH });
      if (asset.role === "thumbnail") {
        coverAssetsByItemId.set(asset.media_item_id, signedAsset);
      }
      if (
        asset.role === "original" &&
        asset.mime_type?.startsWith("image/") &&
        !originalAssetsByItemId.has(asset.media_item_id)
      ) {
        originalAssetsByItemId.set(
          asset.media_item_id,
          await createSignedAssetPayload(supabase, asset, { previewWidth: LIKE_PREVIEW_WIDTH }),
        );
      }
    }
  }

  const slugMap = new Map<string, string>();
  const { data: ownerPublicItems, error: ownerPublicItemsError } = await supabase
    .from("media_items")
    .select("id, owner_user_id, collection_id, music_release_type, title")
    .in("owner_user_id", ownerIds)
    .eq("visibility", "public")
    .eq("state", "ready");

  if (ownerPublicItemsError) {
    throw new Error(ownerPublicItemsError.message);
  }

  const ownerPublicCollectionIds = [
    ...new Set((ownerPublicItems ?? []).map((item) => item.collection_id).filter(Boolean)),
  ];
  const ownerPublicCollectionTitleById = new Map<string, string>();
  if (ownerPublicCollectionIds.length > 0) {
    const { data: collections, error: collectionsError } = await supabase
      .from("media_collections")
      .select("id, title")
      .in("id", ownerPublicCollectionIds);

    if (collectionsError) {
      throw new Error(collectionsError.message);
    }

    for (const collection of collections ?? []) {
      ownerPublicCollectionTitleById.set(collection.id, collection.title);
    }
  }

  for (const ownerId of ownerIds) {
    const ownerItems = (ownerPublicItems ?? []).filter((item) => item.owner_user_id === ownerId);
    for (const ownerItem of attachPublicMediaSlugs(
      ownerItems.map((item) => ({
        id: item.id,
        title: item.title,
        collectionId: item.collection_id,
        collectionTitle: item.collection_id ? ownerPublicCollectionTitleById.get(item.collection_id) || null : null,
        releaseType: item.music_release_type,
      })),
    )) {
      slugMap.set(ownerItem.id, ownerItem.slug);
    }
  }

  const likedCreatedAtByItemId = new Map(
    (likedRows ?? []).map((row) => [row.media_item_id, row.created_at]),
  );

  const itemById = new Map(filteredItems.map((item) => [item.id, item]));

  return mediaItemIds
    .map((mediaItemId) => itemById.get(mediaItemId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => {
      const owner = ownerProfilesById.get(item.owner_user_id);
      if (!owner) {
        return null;
      }

      const track: PublicLikedTrack = {
        id: item.id,
        title:
          item.collection_id && item.music_release_type && item.music_release_type !== "single"
            ? ownerPublicCollectionTitleById.get(item.collection_id) || item.title
            : item.title,
        mediaKind: item.media_kind,
        releaseType: item.music_release_type,
        slug: slugMap.get(item.id) || "",
        likedAt: likedCreatedAtByItemId.get(item.id) || item.published_at || null,
        coverArtUrl: (coverAssetsByItemId.get(item.id) as { url?: string } | undefined)?.url || null,
        previewUrl:
          (coverAssetsByItemId.get(item.id) as { url?: string } | undefined)?.url ||
          (originalAssetsByItemId.get(item.id) as { url?: string } | undefined)?.url ||
          null,
        artist: {
          username: owner.username,
          displayName: owner.displayName,
        },
      };
      return track;
    })
    .filter((value): value is PublicLikedTrack => Boolean(value));
}

export async function getPublicProfilePageData(username: string) {
  const base = await loadProfileBase(username);
  if (!base) {
    return null;
  }

  const items = await loadMediaItems(base.supabase, base.profile.userId, ["public"]);
  const likedTracks = await loadLikedTracks(base.supabase, base.profile.userId);
  return {
    profile: base.profile,
    items,
    likedTracks,
  };
}

export async function getPublicMediaPageData(username: string, mediaSlug: string) {
  const base = await loadProfileBase(username);
  if (!base) {
    return null;
  }

  const items = await loadMediaItems(base.supabase, base.profile.userId, ["public", "unlisted"]);
  const matchingItems = items.filter((entry) => entry.slug === String(mediaSlug || "").trim());
  const item = matchingItems.sort((first, second) => {
    const firstTrackNumber = first.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const secondTrackNumber = second.trackNumber ?? Number.MAX_SAFE_INTEGER;
    if (firstTrackNumber !== secondTrackNumber) {
      return firstTrackNumber - secondTrackNumber;
    }

    return new Date(first.createdAt || 0).getTime() - new Date(second.createdAt || 0).getTime();
  })[0];

  if (!item) {
    return null;
  }

  return {
    profile: base.profile,
    item,
    publicItems: items.filter((entry) => entry.visibility === "public"),
  };
}
