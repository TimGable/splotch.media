import { NextResponse } from "next/server";
import { attachPublicMediaSlugs } from "@/lib/media-slugs";
import { ensureAppUser, ensureProfile, getAuthContext } from "@/lib/supabase/app-user";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_FEED_ITEMS = 50;
const DISCOVERY_SAMPLE_SIZE = 160;

type FeedMediaItemRow = {
  id: string;
  owner_user_id: string;
  media_kind: string;
  music_release_type: string | null;
  title: string;
  description: string;
  visibility: string;
  created_at: string;
  published_at: string | null;
  duration_ms: number | null;
  primary_asset_id: string | null;
};

type FeedSlugRow = {
  id: string;
  owner_user_id: string;
  title: string;
};

function shuffleItems(items: FeedMediaItemRow[]) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

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

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const supabase = createSupabaseServiceRoleClient();

    const { data: followRows, error: followsError } = await supabase
      .from("follows")
      .select("artist_user_id")
      .eq("follower_user_id", userId);

    if (followsError) {
      return NextResponse.json({ error: followsError.message }, { status: 500 });
    }

    const followedArtistIds = [...new Set((followRows ?? []).map((row) => row.artist_user_id).filter(Boolean))];
    const feedSource = followedArtistIds.length > 0 ? "following" : "discovery";

    const mediaItemsQuery = supabase
      .from("media_items")
      .select(
        "id, owner_user_id, media_kind, music_release_type, title, description, visibility, created_at, published_at, duration_ms, primary_asset_id",
      )
      .eq("state", "ready")
      .eq("visibility", "public")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    const mediaPromise =
      followedArtistIds.length > 0
        ? mediaItemsQuery.in("owner_user_id", followedArtistIds).limit(MAX_FEED_ITEMS)
        : mediaItemsQuery.neq("owner_user_id", userId).limit(DISCOVERY_SAMPLE_SIZE);

    const { data: rawMediaItems, error: mediaItemsError } = await mediaPromise;

    if (mediaItemsError) {
      return NextResponse.json({ error: mediaItemsError.message }, { status: 500 });
    }

    const mediaItems =
      followedArtistIds.length > 0
        ? rawMediaItems ?? []
        : shuffleItems(rawMediaItems ?? []).slice(0, MAX_FEED_ITEMS);
    const ownerIds = [...new Set(mediaItems.map((item) => item.owner_user_id).filter(Boolean))];

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_asset_id")
      .in("user_id", ownerIds.length > 0 ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const { data: slugRows, error: slugRowsError } = await supabase
      .from("media_items")
      .select("id, owner_user_id, title")
      .eq("state", "ready")
      .in("visibility", ["public", "unlisted"])
      .in("owner_user_id", ownerIds.length > 0 ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);

    if (slugRowsError) {
      return NextResponse.json({ error: slugRowsError.message }, { status: 500 });
    }

    const profileByUserId = new Map(
      (profiles ?? []).map((profile) => [
        profile.user_id,
        {
          userId: profile.user_id,
          username: profile.username,
          displayName: profile.display_name,
          avatarAssetId: profile.avatar_asset_id,
        },
      ]),
    );

    const slugByItemId = new Map<string, string>();
    const slugRowsByOwnerId = new Map<string, FeedSlugRow[]>();

    for (const slugRow of slugRows ?? []) {
      if (!slugRowsByOwnerId.has(slugRow.owner_user_id)) {
        slugRowsByOwnerId.set(slugRow.owner_user_id, []);
      }

      slugRowsByOwnerId.get(slugRow.owner_user_id)?.push(slugRow);
    }

    for (const ownerRows of slugRowsByOwnerId.values()) {
      for (const item of attachPublicMediaSlugs(ownerRows)) {
        slugByItemId.set(item.id, item.slug);
      }
    }

    const itemIds = (mediaItems ?? []).map((item) => item.id);
    const avatarAssetIds = (profiles ?? [])
      .map((profile) => profile.avatar_asset_id)
      .filter((value): value is string => Boolean(value));

    const mediaAssetsById = new Map<string, Record<string, unknown>>();
    const coverAssetsByItemId = new Map<string, Record<string, unknown>>();
    const avatarUrlsByAssetId = new Map<string, string | null>();
    const likeCountsByItemId = new Map<string, number>();
    const commentCountsByItemId = new Map<string, number>();
    const likedItemIds = new Set<string>();

    if (itemIds.length > 0) {
      const { data: mediaAssets, error: mediaAssetsError } = await supabase
        .from("media_assets")
        .select("id, media_item_id, role, bucket, object_key, file_name, mime_type, file_size_bytes")
        .in("media_item_id", itemIds)
        .in("role", ["original", "thumbnail"]);

      if (mediaAssetsError) {
        return NextResponse.json({ error: mediaAssetsError.message }, { status: 500 });
      }

      for (const asset of mediaAssets ?? []) {
        const signedAsset = await createSignedAssetPayload(supabase, asset);

        if (asset.role === "original") {
          mediaAssetsById.set(asset.id, signedAsset);
        }

        if (asset.role === "thumbnail" && asset.media_item_id) {
          coverAssetsByItemId.set(asset.media_item_id, signedAsset);
        }
      }

      const [
        { data: likeRows, error: likeRowsError },
        { data: commentRows, error: commentRowsError },
        { data: likedRows, error: likedRowsError },
      ] = await Promise.all([
        supabase.from("media_likes").select("media_item_id").in("media_item_id", itemIds),
        supabase
          .from("media_comments")
          .select("media_item_id")
          .in("media_item_id", itemIds)
          .eq("is_deleted", false),
        supabase
          .from("media_likes")
          .select("media_item_id")
          .in("media_item_id", itemIds)
          .eq("user_id", userId),
      ]);

      if (likeRowsError) {
        return NextResponse.json({ error: likeRowsError.message }, { status: 500 });
      }

      if (commentRowsError) {
        return NextResponse.json({ error: commentRowsError.message }, { status: 500 });
      }

      if (likedRowsError) {
        return NextResponse.json({ error: likedRowsError.message }, { status: 500 });
      }

      for (const row of likeRows ?? []) {
        likeCountsByItemId.set(
          row.media_item_id,
          (likeCountsByItemId.get(row.media_item_id) || 0) + 1,
        );
      }

      for (const row of commentRows ?? []) {
        commentCountsByItemId.set(
          row.media_item_id,
          (commentCountsByItemId.get(row.media_item_id) || 0) + 1,
        );
      }

      for (const row of likedRows ?? []) {
        likedItemIds.add(row.media_item_id);
      }
    }

    if (avatarAssetIds.length > 0) {
      const { data: avatarAssets, error: avatarAssetsError } = await supabase
        .from("media_assets")
        .select("id, media_item_id, bucket, object_key, file_name, mime_type, file_size_bytes")
        .in("id", avatarAssetIds);

      if (avatarAssetsError) {
        return NextResponse.json({ error: avatarAssetsError.message }, { status: 500 });
      }

      for (const asset of avatarAssets ?? []) {
        const signedAsset = await createSignedAssetPayload(supabase, asset);
        avatarUrlsByAssetId.set(asset.id, signedAsset.url);
      }
    }

    const items = (mediaItems ?? []).flatMap((item: FeedMediaItemRow) => {
      const artist = profileByUserId.get(item.owner_user_id);
      const slug = slugByItemId.get(item.id);
      if (!artist?.username || !slug) {
        return [];
      }

      return [
        {
          id: item.id,
          mediaKind: item.media_kind,
          releaseType: item.music_release_type,
          title: item.title,
          description: item.description,
          visibility: item.visibility,
          createdAt: item.created_at,
          publishedAt: item.published_at,
          durationMs: item.duration_ms,
          slug,
          asset: item.primary_asset_id ? mediaAssetsById.get(item.primary_asset_id) ?? null : null,
          coverAsset: coverAssetsByItemId.get(item.id) ?? null,
          artist: {
            userId: artist.userId,
            username: artist.username,
            displayName: artist.displayName,
            avatarUrl: artist.avatarAssetId ? avatarUrlsByAssetId.get(artist.avatarAssetId) ?? null : null,
          },
          likes: likeCountsByItemId.get(item.id) || 0,
          comments: commentCountsByItemId.get(item.id) || 0,
          isLiked: likedItemIds.has(item.id),
        },
      ];
    });

    return NextResponse.json({ items, source: feedSource });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
