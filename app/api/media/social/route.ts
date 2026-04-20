import { NextResponse } from "next/server";
import { getMediaSocialSummary } from "@/lib/media-social";
import { ensureAppUser, ensureProfile, getAuthContext } from "@/lib/supabase/app-user";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const MAX_SOCIAL_ITEMS = 120;

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const requestedIds = requestUrl.searchParams
      .get("ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
    const mediaItemIds = [...new Set(requestedIds)].slice(0, MAX_SOCIAL_ITEMS);

    if (mediaItemIds.length === 0) {
      return NextResponse.json({ items: {} });
    }

    const supabase = createSupabaseServiceRoleClient();
    const auth = await getAuthContext(request);
    let currentUserId: string | null = null;

    if (auth) {
      const ensuredUser = await ensureAppUser(auth.authUserId, auth.email);
      await ensureProfile(ensuredUser.userId, auth.email);
      currentUserId = ensuredUser.userId;
    }

    const { data: mediaItems, error: mediaItemsError } = await supabase
      .from("media_items")
      .select("id, owner_user_id, visibility, state")
      .in("id", mediaItemIds)
      .eq("state", "ready");

    if (mediaItemsError) {
      return NextResponse.json({ error: mediaItemsError.message }, { status: 500 });
    }

    const accessibleIds = (mediaItems ?? [])
      .filter((item) => {
        const isOwner = currentUserId === item.owner_user_id;
        const isPubliclyAccessible = item.visibility === "public" || item.visibility === "unlisted";
        return isOwner || isPubliclyAccessible;
      })
      .map((item) => item.id);

    const socialSummaryByItemId = await getMediaSocialSummary(supabase, accessibleIds, currentUserId);
    const items = Object.fromEntries(
      accessibleIds.map((mediaItemId) => {
        const summary = socialSummaryByItemId.get(mediaItemId);
        return [
          mediaItemId,
          {
            likes: summary?.likes || 0,
            comments: summary?.comments || 0,
            isLiked: Boolean(summary?.isLiked),
          },
        ];
      }),
    );

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
