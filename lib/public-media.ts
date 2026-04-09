import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { attachPublicMediaSlugs } from "@/lib/media-slugs";
import { getMediaSocialSummary } from "@/lib/media-social";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type VisibilityLevel = "public" | "unlisted";

type RawMediaItem = {
  id: string;
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
) {
  let assetUrl: string | null = null;
  const { data: signedData, error: signedError } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_key, SIGNED_URL_TTL_SECONDS);

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
    supabase.from("users").select("auth_user_id").eq("id", profile.user_id).maybeSingle(),
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
      "id, media_kind, music_release_type, title, description, visibility, state, created_at, published_at, duration_ms, primary_asset_id",
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
  const coverAssetsByItemId = new Map<string, Record<string, unknown>>();

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
      }

      if (asset.role === "thumbnail" && asset.media_item_id) {
        coverAssetsByItemId.set(asset.media_item_id, signedAsset);
      }
    }
  }

  return attachPublicMediaSlugs(
    (mediaItems ?? []).map((item: RawMediaItem) => ({
      id: item.id,
      mediaKind: item.media_kind,
      releaseType: item.music_release_type,
      title: item.title,
      description: item.description,
      visibility: item.visibility,
      state: item.state,
      createdAt: item.created_at,
      publishedAt: item.published_at,
      durationMs: item.duration_ms,
      asset: item.primary_asset_id ? primaryAssetsById.get(item.primary_asset_id) ?? null : null,
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
) {
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
      "id, owner_user_id, title, media_kind, visibility, state, published_at, primary_asset_id",
    )
    .in("id", mediaItemIds)
    .eq("media_kind", "music")
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

  if (filteredItems.length > 0) {
    const { data: coverAssets, error: coverAssetsError } = await supabase
      .from("media_assets")
      .select("id, media_item_id, bucket, object_key, file_name, mime_type, file_size_bytes")
      .in("media_item_id", filteredItems.map((item) => item.id))
      .eq("role", "thumbnail");

    if (coverAssetsError) {
      throw new Error(coverAssetsError.message);
    }

    for (const asset of coverAssets ?? []) {
      if (!asset.media_item_id) {
        continue;
      }

      const signedAsset = await createSignedAssetPayload(supabase, asset);
      coverAssetsByItemId.set(asset.media_item_id, signedAsset);
    }
  }

  const slugMap = new Map<string, string>();
  const { data: ownerPublicItems, error: ownerPublicItemsError } = await supabase
    .from("media_items")
    .select("id, owner_user_id, title")
    .in("owner_user_id", ownerIds)
    .eq("media_kind", "music")
    .eq("visibility", "public")
    .eq("state", "ready");

  if (ownerPublicItemsError) {
    throw new Error(ownerPublicItemsError.message);
  }

  for (const ownerId of ownerIds) {
    const ownerItems = (ownerPublicItems ?? []).filter((item) => item.owner_user_id === ownerId);
    for (const ownerItem of attachPublicMediaSlugs(
      ownerItems.map((item) => ({ id: item.id, title: item.title })),
    )) {
      slugMap.set(ownerItem.id, ownerItem.slug);
    }
  }

  const likedCreatedAtByItemId = new Map(
    (likedRows ?? []).map((row) => [row.media_item_id, row.created_at]),
  );

  return filteredItems
    .map((item) => {
      const owner = ownerProfilesById.get(item.owner_user_id);
      if (!owner) {
        return null;
      }

      return {
        id: item.id,
        title: item.title,
        slug: slugMap.get(item.id) || "",
        likedAt: likedCreatedAtByItemId.get(item.id) || item.published_at || null,
        coverArtUrl: (coverAssetsByItemId.get(item.id) as { url?: string } | undefined)?.url || null,
        artist: {
          username: owner.username,
          displayName: owner.displayName,
        },
      };
    })
    .filter(Boolean);
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
  const item = items.find((entry) => entry.slug === String(mediaSlug || "").trim());

  if (!item) {
    return null;
  }

  return {
    profile: base.profile,
    item,
    publicItems: items.filter((entry) => entry.visibility === "public"),
  };
}
