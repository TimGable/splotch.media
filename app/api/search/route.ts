import { NextResponse } from "next/server";
import { attachPublicMediaSlugs, buildPublicMediaPath, buildPublicProfilePath, slugifyMediaTitle } from "@/lib/media-slugs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const RESULT_LIMIT = 6;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function normalizeQuery(value: string) {
  return String(value || "").trim();
}

async function createSignedUrl(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  bucket: string,
  objectKey: string,
) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
  if (error) {
    return null;
  }

  return data?.signedUrl ?? null;
}

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const url = new URL(request.url);
    const query = normalizeQuery(url.searchParams.get("q") || "");

    if (query.length < 2) {
      return NextResponse.json({
        artists: [],
        media: { music: [], visual: [], video: [] },
      });
    }

    const likePattern = `%${query.replace(/[%_]/g, "")}%`;

    const { data: matchingProfiles, error: matchingProfilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_asset_id")
      .or(`username.ilike.${likePattern},display_name.ilike.${likePattern}`)
      .limit(RESULT_LIMIT);

    if (matchingProfilesError) {
      throw new Error(matchingProfilesError.message);
    }

    const artistUserIds = (matchingProfiles ?? []).map((profile) => profile.user_id);

    const titleMatchesPromise = supabase
      .from("media_items")
      .select("id, owner_user_id, collection_id, media_kind, music_release_type, title, description, created_at, visibility, state")
      .eq("state", "ready")
      .in("visibility", ["public", "unlisted"])
      .or(`title.ilike.${likePattern},description.ilike.${likePattern}`)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT * 3);

    const artistMatchesPromise =
      artistUserIds.length > 0
        ? supabase
            .from("media_items")
            .select("id, owner_user_id, collection_id, media_kind, music_release_type, title, description, created_at, visibility, state")
            .eq("state", "ready")
            .in("visibility", ["public", "unlisted"])
            .in("owner_user_id", artistUserIds)
            .order("created_at", { ascending: false })
            .limit(RESULT_LIMIT * 2)
        : Promise.resolve({ data: [], error: null });

    const [{ data: titleMatches, error: titleMatchesError }, { data: artistMatches, error: artistMatchesError }] =
      await Promise.all([titleMatchesPromise, artistMatchesPromise]);

    if (titleMatchesError) {
      throw new Error(titleMatchesError.message);
    }

    if (artistMatchesError) {
      throw new Error(artistMatchesError.message);
    }

    const mediaById = new Map<string, any>();
    for (const item of [...(titleMatches ?? []), ...(artistMatches ?? [])]) {
      mediaById.set(item.id, item);
    }

    const mediaItems = [...mediaById.values()];
    const ownerIds = [...new Set(mediaItems.map((item) => item.owner_user_id).filter(Boolean))];
    const ownerIdsMissingProfiles = ownerIds.filter(
      (userId) => !(matchingProfiles ?? []).some((profile) => profile.user_id === userId),
    );

    let supplementalProfiles: any[] = [];
    if (ownerIdsMissingProfiles.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_asset_id")
        .in("user_id", ownerIdsMissingProfiles);
      if (error) {
        throw new Error(error.message);
      }
      supplementalProfiles = data ?? [];
    }

    const allProfiles = [...(matchingProfiles ?? []), ...supplementalProfiles];
    const avatarAssetIds = [...new Set(allProfiles.map((profile) => profile.avatar_asset_id).filter(Boolean))];
    const avatarUrlByAssetId = new Map<string, string | null>();

    if (avatarAssetIds.length > 0) {
      const { data: avatarAssets, error: avatarAssetsError } = await supabase
        .from("media_assets")
        .select("id, bucket, object_key")
        .in("id", avatarAssetIds);

      if (avatarAssetsError) {
        throw new Error(avatarAssetsError.message);
      }

      for (const asset of avatarAssets ?? []) {
        avatarUrlByAssetId.set(asset.id, await createSignedUrl(supabase, asset.bucket, asset.object_key));
      }
    }

    const ownerProfileById = new Map(
      allProfiles.map((profile) => [
        profile.user_id,
        {
          username: profile.username,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_asset_id ? avatarUrlByAssetId.get(profile.avatar_asset_id) ?? null : null,
        },
      ]),
    );

    const allOwnerMediaTitles = ownerIds.length > 0
      ? await supabase
          .from("media_items")
          .select("id, owner_user_id, collection_id, music_release_type, title")
          .eq("state", "ready")
          .in("visibility", ["public", "unlisted"])
          .in("owner_user_id", ownerIds)
      : { data: [], error: null };

    if (allOwnerMediaTitles.error) {
      throw new Error(allOwnerMediaTitles.error.message);
    }

    const collectionIds = [
      ...new Set(
        (allOwnerMediaTitles.data ?? [])
          .map((item) => item.collection_id)
          .filter(Boolean),
      ),
    ];
    const collectionTitleById = new Map<string, string>();
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

    const slugByMediaId = new Map<string, string>();
    const titlesByOwner = new Map<string, Array<{ id: string; title: string; collectionId: string | null; collectionTitle: string | null; releaseType: string | null }>>();
    for (const item of allOwnerMediaTitles.data ?? []) {
      titlesByOwner.set(item.owner_user_id, [
        ...(titlesByOwner.get(item.owner_user_id) ?? []),
        {
          id: item.id,
          title: item.title,
          collectionId: item.collection_id,
          collectionTitle: item.collection_id ? collectionTitleById.get(item.collection_id) || null : null,
          releaseType: item.music_release_type,
        },
      ]);
    }

    for (const items of titlesByOwner.values()) {
      for (const item of attachPublicMediaSlugs(items)) {
        slugByMediaId.set(item.id, item.slug);
      }
    }

    const primaryAssetsByItemId = new Map<string, { mimeType: string; fileSizeBytes: number; url: string | null }>();
    if (mediaItems.length > 0) {
      const { data: assets, error: assetsError } = await supabase
        .from("media_assets")
        .select("media_item_id, role, bucket, object_key, mime_type, file_size_bytes")
        .in("media_item_id", mediaItems.map((item) => item.id))
        .in("role", ["thumbnail", "original"]);

      if (assetsError) {
        throw new Error(assetsError.message);
      }

      for (const asset of assets ?? []) {
        if (!asset.media_item_id || primaryAssetsByItemId.has(asset.media_item_id)) {
          continue;
        }
        primaryAssetsByItemId.set(asset.media_item_id, {
          mimeType: asset.mime_type,
          fileSizeBytes: asset.file_size_bytes,
          url: await createSignedUrl(supabase, asset.bucket, asset.object_key),
        });
      }
    }

    const artists = (matchingProfiles ?? []).slice(0, RESULT_LIMIT).map((profile) => ({
      userId: profile.user_id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_asset_id ? avatarUrlByAssetId.get(profile.avatar_asset_id) ?? null : null,
      path: buildPublicProfilePath(profile.username),
    }));

    const baseMediaResults = mediaItems
      .map((item) => {
        const owner = ownerProfileById.get(item.owner_user_id);
        if (!owner?.username) {
          return null;
        }

        return {
          id: item.id,
          title: item.title,
          description: item.description,
          mediaKind: item.media_kind,
          createdAt: item.created_at,
          artist: owner,
          previewUrl: primaryAssetsByItemId.get(item.id)?.url ?? null,
          path: buildPublicMediaPath(owner.username, slugByMediaId.get(item.id) || slugifyMediaTitle(item.title)),
        };
      })
      .filter(Boolean) as any[];

    const media = {
      music: baseMediaResults.filter((item) => item.mediaKind === "music").slice(0, RESULT_LIMIT),
      visual: baseMediaResults.filter((item) => item.mediaKind === "visual").slice(0, RESULT_LIMIT),
      video: baseMediaResults.filter((item) => item.mediaKind === "video").slice(0, RESULT_LIMIT),
    };

    return NextResponse.json({ artists, media });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected search error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
