import { NextResponse } from "next/server";
import {
  ensureAppUser,
  ensureProfile,
  getAuthContext,
} from "@/lib/supabase/app-user";
import {
  createAppNotification,
  deleteAppNotification,
} from "@/lib/notifications/app-notifications";
import { createMentionNotifications } from "@/lib/mentions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const MAX_COMMENT_LENGTH = 1000;
const MAX_COMMENTS = 100;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type AccessContext = {
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  mediaItem: {
    id: string;
    owner_user_id: string;
    visibility: string;
    state: string;
  };
  currentUserId: string | null;
};

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
) {
  const { data, error } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_key, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return null;
  }

  return {
    id: asset.id,
    fileName: asset.file_name,
    mimeType: asset.mime_type,
    fileSizeBytes: asset.file_size_bytes,
    url: data?.signedUrl ?? null,
  };
}

async function resolveAccess(request: Request, mediaItemId: string): Promise<AccessContext | null> {
  const supabase = createSupabaseServiceRoleClient();
  const auth = await getAuthContext(request);
  let currentUserId: string | null = null;

  // Social data follows the same visibility rules as the media item itself.
  // Owners can see their own work; everyone else needs a public/unlisted item.
  if (auth) {
    const ensuredUser = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(ensuredUser.userId, auth.email);
    currentUserId = ensuredUser.userId;
  }

  const { data: mediaItem, error: mediaItemError } = await supabase
    .from("media_items")
    .select("id, owner_user_id, visibility, state")
    .eq("id", mediaItemId)
    .maybeSingle();

  if (mediaItemError) {
    throw new Error(mediaItemError.message);
  }

  if (!mediaItem || mediaItem.state !== "ready") {
    return null;
  }

  const isOwner = currentUserId === mediaItem.owner_user_id;
  const isPubliclyAccessible =
    mediaItem.visibility === "public" || mediaItem.visibility === "unlisted";

  if (!isOwner && !isPubliclyAccessible) {
    return null;
  }

  return {
    supabase,
    mediaItem,
    currentUserId,
  };
}

async function buildSocialPayload(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  mediaItemId: string,
  currentUserId: string | null,
) {
  // Keep the panel cheap to render by fetching counts, the current user's like,
  // and visible comments in one pass.
  const [
    { count: likeCount, error: likeCountError },
    { count: commentCount, error: commentCountError },
    { data: likedRow, error: likedError },
    { data: comments, error: commentsError },
  ] = await Promise.all([
    supabase
      .from("media_likes")
      .select("*", { count: "exact", head: true })
      .eq("media_item_id", mediaItemId),
    supabase
      .from("media_comments")
      .select("*", { count: "exact", head: true })
      .eq("media_item_id", mediaItemId)
      .eq("is_deleted", false),
    currentUserId
      ? supabase
          .from("media_likes")
          .select("media_item_id")
          .eq("media_item_id", mediaItemId)
          .eq("user_id", currentUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("media_comments")
      .select("id, user_id, parent_comment_id, body, is_deleted, created_at")
      .eq("media_item_id", mediaItemId)
      .order("created_at", { ascending: true })
      .limit(MAX_COMMENTS),
  ]);

  if (likeCountError) {
    throw new Error(likeCountError.message);
  }

  if (commentCountError) {
    throw new Error(commentCountError.message);
  }

  if (likedError) {
    throw new Error(likedError.message);
  }

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const authorUserIds = [...new Set((comments ?? []).map((comment) => comment.user_id).filter(Boolean))];
  const profileByUserId = new Map<
    string,
    {
      username: string;
      displayName: string;
      avatarAssetId: string | null;
    }
  >();
  const avatarUrlsByAssetId = new Map<string, string | null>();

  if (authorUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_asset_id")
      .in("user_id", authorUserIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of profiles ?? []) {
      profileByUserId.set(profile.user_id, {
        username: profile.username,
        displayName: profile.display_name,
        avatarAssetId: profile.avatar_asset_id,
      });
    }

    const avatarAssetIds = (profiles ?? [])
      .map((profile) => profile.avatar_asset_id)
      .filter((value): value is string => Boolean(value));

    if (avatarAssetIds.length > 0) {
      const { data: avatarAssets, error: avatarAssetsError } = await supabase
        .from("media_assets")
        .select("id, bucket, object_key, file_name, mime_type, file_size_bytes")
        .in("id", avatarAssetIds);

      if (avatarAssetsError) {
        throw new Error(avatarAssetsError.message);
      }

      for (const asset of avatarAssets ?? []) {
        const signedAsset = await createSignedAssetPayload(supabase, asset);
        avatarUrlsByAssetId.set(asset.id, signedAsset?.url ?? null);
      }
    }
  }

  return {
    likeCount: likeCount || 0,
    commentCount: commentCount || 0,
    isLiked: Boolean(likedRow),
    comments: (comments ?? []).map((comment) => {
      const author = profileByUserId.get(comment.user_id);
      const avatarUrl =
        author?.avatarAssetId ? avatarUrlsByAssetId.get(author.avatarAssetId) ?? null : null;

      return {
        id: comment.id,
        body: comment.body,
        isDeleted: Boolean(comment.is_deleted),
        createdAt: comment.created_at,
        parentCommentId: comment.parent_comment_id,
        canDelete: currentUserId === comment.user_id,
        author: author
          ? {
              username: author.username,
              displayName: author.displayName,
              avatarUrl,
            }
          : null,
      };
    }),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaItemId: string }> },
) {
  try {
    const { mediaItemId } = await context.params;
    const access = await resolveAccess(request, mediaItemId);

    if (!access) {
      return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    }

    const payload = await buildSocialPayload(
      access.supabase,
      access.mediaItem.id,
      access.currentUserId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaItemId: string }> },
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { mediaItemId } = await context.params;
    const access = await resolveAccess(request, mediaItemId);
    if (!access?.currentUserId) {
      return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "toggle-like") {
      const { data: existingLike, error: existingLikeError } = await access.supabase
        .from("media_likes")
        .select("media_item_id")
        .eq("media_item_id", mediaItemId)
        .eq("user_id", access.currentUserId)
        .maybeSingle();

      if (existingLikeError) {
        return NextResponse.json({ error: existingLikeError.message }, { status: 500 });
      }

      if (existingLike) {
        const { error: deleteError } = await access.supabase
          .from("media_likes")
          .delete()
          .eq("media_item_id", mediaItemId)
          .eq("user_id", access.currentUserId);

        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        try {
          await deleteAppNotification({
            recipientUserId: access.mediaItem.owner_user_id,
            actorUserId: access.currentUserId,
            type: "like",
            mediaItemId,
          });
        } catch (notificationError) {
          console.error("Failed to delete like notification:", notificationError);
        }
      } else {
        const { error: insertError } = await access.supabase.from("media_likes").insert({
          media_item_id: mediaItemId,
          user_id: access.currentUserId,
        });

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        try {
          await createAppNotification({
            recipientUserId: access.mediaItem.owner_user_id,
            actorUserId: access.currentUserId,
            type: "like",
            mediaItemId,
          });
        } catch (notificationError) {
          console.error("Failed to create like notification:", notificationError);
        }
      }

      const payload = await buildSocialPayload(
        access.supabase,
        access.mediaItem.id,
        access.currentUserId,
      );
      return NextResponse.json(payload);
    }

    if (action === "comment") {
      const commentBody = String(body?.body || "").trim();
      const parentCommentId = body?.parentCommentId
        ? String(body.parentCommentId).trim()
        : null;
      if (!commentBody) {
        return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
      }

      if (commentBody.length > MAX_COMMENT_LENGTH) {
        return NextResponse.json(
          { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less.` },
          { status: 400 },
        );
      }

      let parentCommentAuthorId: string | null = null;
      if (parentCommentId) {
        const { data: parentComment, error: parentError } = await access.supabase
            .from("media_comments")
            .select("id, user_id, media_item_id, is_deleted")
            .eq("id", parentCommentId)
            .maybeSingle();

        if (parentError) {
          return NextResponse.json({ error: parentError.message }, { status: 500 });
        }

        if (!parentComment || parentComment.media_item_id !== mediaItemId || parentComment.is_deleted) {
          return NextResponse.json({ error: "Cannot reply to that comment." }, { status: 400 });
        }

        parentCommentAuthorId = parentComment.user_id;
      }

      const { error: insertError } = await access.supabase.from("media_comments").insert({
        media_item_id: mediaItemId,
        user_id: access.currentUserId,
        body: commentBody,
        parent_comment_id: parentCommentId,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      const { data: insertedComment, error: insertedCommentError } = await access.supabase
        .from("media_comments")
        .select("id")
        .eq("media_item_id", mediaItemId)
        .eq("user_id", access.currentUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (insertedCommentError) {
        return NextResponse.json({ error: insertedCommentError.message }, { status: 500 });
      }

      try {
        await createAppNotification({
          recipientUserId: access.mediaItem.owner_user_id,
          actorUserId: access.currentUserId,
          type: "comment",
          mediaItemId,
          commentId: insertedComment?.id ?? null,
          data: {
            bodyPreview:
              commentBody.length > 120 ? `${commentBody.slice(0, 117)}...` : commentBody,
          },
        });
      } catch (notificationError) {
        console.error("Failed to create comment notification:", notificationError);
      }

      if (
        parentCommentAuthorId &&
        parentCommentAuthorId !== access.mediaItem.owner_user_id &&
        parentCommentAuthorId !== access.currentUserId
      ) {
        try {
          await createAppNotification({
            recipientUserId: parentCommentAuthorId,
            actorUserId: access.currentUserId,
            type: "comment",
            mediaItemId,
            commentId: insertedComment?.id ?? null,
            data: {
              bodyPreview:
                commentBody.length > 120 ? `${commentBody.slice(0, 117)}...` : commentBody,
              isReply: true,
            },
          });
        } catch (notificationError) {
          console.error("Failed to create reply notification:", notificationError);
        }
      }

      try {
        await createMentionNotifications({
          supabase: access.supabase,
          actorUserId: access.currentUserId,
          body: commentBody,
          mediaItemId,
          commentId: insertedComment?.id ?? null,
          data: {
            source: "media_comment",
          },
        });
      } catch (notificationError) {
        console.error("Failed to create mention notification:", notificationError);
      }

      const payload = await buildSocialPayload(
        access.supabase,
        access.mediaItem.id,
        access.currentUserId,
      );
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Unknown social action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaItemId: string }> },
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { mediaItemId } = await context.params;
    const access = await resolveAccess(request, mediaItemId);
    if (!access?.currentUserId) {
      return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const commentId = String(searchParams.get("commentId") || "").trim();
    if (!commentId) {
      return NextResponse.json({ error: "Missing commentId." }, { status: 400 });
    }

    const { data: comment, error: commentError } = await access.supabase
      .from("media_comments")
      .select("id, user_id")
      .eq("id", commentId)
      .eq("media_item_id", mediaItemId)
      .maybeSingle();

    if (commentError) {
      return NextResponse.json({ error: commentError.message }, { status: 500 });
    }

    if (!comment) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    if (comment.user_id !== access.currentUserId) {
      return NextResponse.json({ error: "You can only remove your own comments." }, { status: 403 });
    }

    const { error: deleteError } = await access.supabase
      .from("media_comments")
      .update({
        is_deleted: true,
        body: "",
      })
      .eq("id", commentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const payload = await buildSocialPayload(
      access.supabase,
      access.mediaItem.id,
      access.currentUserId,
    );
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
