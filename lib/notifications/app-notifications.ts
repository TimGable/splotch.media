import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type NotificationType = "follow" | "like" | "comment";

type CreateNotificationInput = {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  mediaItemId?: string | null;
  commentId?: string | null;
  data?: Record<string, unknown>;
};

export async function createAppNotification(input: CreateNotificationInput) {
  if (!input.recipientUserId || !input.actorUserId) {
    return;
  }

  if (input.recipientUserId === input.actorUserId) {
    return;
  }

  const supabase = createSupabaseServiceRoleClient();

  if (input.type === "follow" || input.type === "like") {
    let deleteQuery = supabase
      .from("notifications")
      .delete()
      .eq("recipient_user_id", input.recipientUserId)
      .eq("actor_user_id", input.actorUserId)
      .eq("type", input.type);

    deleteQuery =
      input.mediaItemId == null
        ? deleteQuery.is("media_item_id", null)
        : deleteQuery.eq("media_item_id", input.mediaItemId);

    await deleteQuery;
  }

  const { error } = await supabase.from("notifications").insert({
    recipient_user_id: input.recipientUserId,
    actor_user_id: input.actorUserId,
    type: input.type,
    media_item_id: input.mediaItemId ?? null,
    comment_id: input.commentId ?? null,
    data: input.data ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAppNotification(input: {
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  mediaItemId?: string | null;
}) {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from("notifications")
    .delete()
    .eq("recipient_user_id", input.recipientUserId)
    .eq("actor_user_id", input.actorUserId)
    .eq("type", input.type);

  query =
    input.mediaItemId == null
      ? query.is("media_item_id", null)
      : query.eq("media_item_id", input.mediaItemId);

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}
