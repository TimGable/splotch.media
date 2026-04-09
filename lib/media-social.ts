import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type MediaSocialSummary = {
  likes: number;
  comments: number;
  isLiked: boolean;
};

export async function getMediaSocialSummary(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  mediaItemIds: string[],
  currentUserId: string | null = null,
) {
  const summaryByItemId = new Map<string, MediaSocialSummary>();

  for (const mediaItemId of mediaItemIds) {
    summaryByItemId.set(mediaItemId, {
      likes: 0,
      comments: 0,
      isLiked: false,
    });
  }

  if (mediaItemIds.length === 0) {
    return summaryByItemId;
  }

  const [
    { data: likeRows, error: likeRowsError },
    { data: commentRows, error: commentRowsError },
    likedResult,
  ] = await Promise.all([
    supabase.from("media_likes").select("media_item_id").in("media_item_id", mediaItemIds),
    supabase
      .from("media_comments")
      .select("media_item_id")
      .in("media_item_id", mediaItemIds)
      .eq("is_deleted", false),
    currentUserId
      ? supabase
          .from("media_likes")
          .select("media_item_id")
          .in("media_item_id", mediaItemIds)
          .eq("user_id", currentUserId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (likeRowsError) {
    throw new Error(likeRowsError.message);
  }

  if (commentRowsError) {
    throw new Error(commentRowsError.message);
  }

  if (likedResult.error) {
    throw new Error(likedResult.error.message);
  }

  for (const row of likeRows ?? []) {
    const existing = summaryByItemId.get(row.media_item_id);
    if (!existing) {
      continue;
    }

    summaryByItemId.set(row.media_item_id, {
      ...existing,
      likes: existing.likes + 1,
    });
  }

  for (const row of commentRows ?? []) {
    const existing = summaryByItemId.get(row.media_item_id);
    if (!existing) {
      continue;
    }

    summaryByItemId.set(row.media_item_id, {
      ...existing,
      comments: existing.comments + 1,
    });
  }

  for (const row of likedResult.data ?? []) {
    const existing = summaryByItemId.get(row.media_item_id);
    if (!existing) {
      continue;
    }

    summaryByItemId.set(row.media_item_id, {
      ...existing,
      isLiked: true,
    });
  }

  return summaryByItemId;
}
