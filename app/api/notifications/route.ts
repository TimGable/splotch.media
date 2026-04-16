import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { attachPublicMediaSlugs, buildPublicMediaPath, buildPublicProfilePath } from "@/lib/media-slugs";
import {
  ensureAppUser,
  ensureProfile,
  getAuthContext,
} from "@/lib/supabase/app-user";

const NOTIFICATION_LIMIT = 40;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(value).toLocaleDateString();
}

async function createSignedAvatarUrl(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetId: string | null,
) {
  if (!assetId) {
    return null;
  }

  const { data: asset, error } = await supabase
    .from("media_assets")
    .select("bucket, object_key")
    .eq("id", assetId)
    .maybeSingle();

  if (error || !asset?.bucket || !asset.object_key) {
    return null;
  }

  const { data } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_key, SIGNED_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
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
    const [{ data: notifications, error: notificationsError }, { count: unreadCount, error: unreadError }] =
      await Promise.all([
        supabase
          .from("notifications")
          .select("id, actor_user_id, type, media_item_id, comment_id, data, created_at, read_at")
          .eq("recipient_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(NOTIFICATION_LIMIT),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("recipient_user_id", userId)
          .is("read_at", null),
      ]);

    if (notificationsError) {
      return NextResponse.json({ error: notificationsError.message }, { status: 500 });
    }

    if (unreadError) {
      return NextResponse.json({ error: unreadError.message }, { status: 500 });
    }

    const actorIds = [...new Set((notifications ?? []).map((entry) => entry.actor_user_id).filter(Boolean))];
    const mediaItemIds = [...new Set((notifications ?? []).map((entry) => entry.media_item_id).filter(Boolean))];

    const actorProfilesById = new Map<
      string,
      {
        username: string;
        displayName: string;
        avatarAssetId: string | null;
        avatarUrl: string | null;
      }
    >();
    const mediaItemsById = new Map<
      string,
      {
        title: string;
        mediaKind: string;
        ownerUserId: string;
        collectionId?: string | null;
        collectionTitle?: string | null;
        releaseType?: string | null;
        slug?: string;
      }
    >();
    const profileByUserId = new Map<string, { username: string }>();

    if (actorIds.length > 0) {
      const { data: actorProfiles, error: actorProfilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_asset_id")
        .in("user_id", actorIds);

      if (actorProfilesError) {
        return NextResponse.json({ error: actorProfilesError.message }, { status: 500 });
      }

      for (const profile of actorProfiles ?? []) {
        actorProfilesById.set(profile.user_id, {
          username: profile.username,
          displayName: profile.display_name,
          avatarAssetId: profile.avatar_asset_id,
          avatarUrl: null,
        });
      }

      await Promise.all(
        [...actorProfilesById.entries()].map(async ([actorId, actor]) => {
          const avatarUrl = await createSignedAvatarUrl(supabase, actor.avatarAssetId);
          actorProfilesById.set(actorId, { ...actor, avatarUrl });
        }),
      );
    }

    if (mediaItemIds.length > 0) {
      const { data: mediaItems, error: mediaItemsError } = await supabase
        .from("media_items")
        .select("id, title, media_kind, owner_user_id, collection_id, music_release_type")
        .in("id", mediaItemIds);

      if (mediaItemsError) {
        return NextResponse.json({ error: mediaItemsError.message }, { status: 500 });
      }

      for (const item of mediaItems ?? []) {
        mediaItemsById.set(item.id, {
          title: item.title,
          mediaKind: item.media_kind,
          ownerUserId: item.owner_user_id,
          collectionId: item.collection_id,
          releaseType: item.music_release_type,
        });
      }

      const ownerIds = [...new Set((mediaItems ?? []).map((item) => item.owner_user_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        const { data: ownerProfiles, error: ownerProfilesError } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", ownerIds);

        if (ownerProfilesError) {
          return NextResponse.json({ error: ownerProfilesError.message }, { status: 500 });
        }

        for (const ownerProfile of ownerProfiles ?? []) {
          profileByUserId.set(ownerProfile.user_id, { username: ownerProfile.username });
        }

        const { data: ownerMediaItems, error: ownerMediaItemsError } = await supabase
          .from("media_items")
          .select("id, owner_user_id, collection_id, music_release_type, title")
          .in("owner_user_id", ownerIds)
          .in("visibility", ["public", "unlisted"])
          .eq("state", "ready");

        if (ownerMediaItemsError) {
          return NextResponse.json({ error: ownerMediaItemsError.message }, { status: 500 });
        }

        const collectionIds = [
          ...new Set((ownerMediaItems ?? []).map((item) => item.collection_id).filter(Boolean)),
        ];
        const collectionTitleById = new Map<string, string>();
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

        const mediaSlugMap = new Map<string, string>();
        for (const ownerId of ownerIds) {
          const ownerItems = (ownerMediaItems ?? []).filter((item) => item.owner_user_id === ownerId);
          for (const ownerItem of attachPublicMediaSlugs(
            ownerItems.map((item) => ({
              id: item.id,
              title: item.title,
              collectionId: item.collection_id,
              collectionTitle: item.collection_id ? collectionTitleById.get(item.collection_id) || null : null,
              releaseType: item.music_release_type,
            })),
          )) {
            mediaSlugMap.set(ownerItem.id, ownerItem.slug);
          }
        }

        for (const [mediaItemId, mediaItem] of mediaItemsById.entries()) {
          const collectionTitle = mediaItem.collectionId
            ? collectionTitleById.get(mediaItem.collectionId) || null
            : null;
          mediaItemsById.set(mediaItemId, {
            ...mediaItem,
            title:
              mediaItem.mediaKind === "music" &&
              mediaItem.collectionId &&
              mediaItem.releaseType !== "single"
                ? collectionTitle || mediaItem.title
                : mediaItem.title,
            collectionTitle,
            slug: mediaSlugMap.get(mediaItemId) || "",
          });
        }
      }
    }

    const items = (notifications ?? []).map((entry) => {
      const actor = actorProfilesById.get(entry.actor_user_id);
      const mediaItem = entry.media_item_id ? mediaItemsById.get(entry.media_item_id) : null;
      const mediaOwner = mediaItem ? profileByUserId.get(mediaItem.ownerUserId) : null;
      const mediaPath =
        mediaItem && mediaOwner
          ? buildPublicMediaPath(mediaOwner.username, mediaItem.slug || "")
          : null;
      const actorPath = actor ? buildPublicProfilePath(actor.username) : null;

      return {
        id: entry.id,
        type: entry.type,
        createdAt: entry.created_at,
        createdAtLabel: formatRelativeTime(entry.created_at),
        isRead: Boolean(entry.read_at),
        actor: actor
          ? {
              username: actor.username,
              displayName: actor.displayName,
              avatarUrl: actor.avatarUrl,
            }
          : null,
        media: mediaItem && mediaOwner
          ? {
              title: mediaItem.title,
              mediaKind: mediaItem.mediaKind,
              username: mediaOwner.username,
              slug: mediaItem.slug || "",
            }
          : null,
        data: entry.data ?? {},
        targetPath: mediaPath || actorPath || null,
      };
    });

    return NextResponse.json({
      unreadCount: unreadCount || 0,
      notifications: items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    if (action !== "mark-all-read") {
      return NextResponse.json({ error: "Unknown notification action." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", userId)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
