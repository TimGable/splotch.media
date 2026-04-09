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
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function buildFollowState(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  followerUserId: string,
  artistUserId: string,
) {
  const [{ count: followerCount, error: followerCountError }, { count: followingCount, error: followingCountError }, { data: existingFollow, error: existingFollowError }] =
    await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("artist_user_id", artistUserId),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_user_id", artistUserId),
      supabase
        .from("follows")
        .select("artist_user_id")
        .eq("follower_user_id", followerUserId)
        .eq("artist_user_id", artistUserId)
        .maybeSingle(),
    ]);

  if (followerCountError) {
    throw new Error(followerCountError.message);
  }

  if (followingCountError) {
    throw new Error(followingCountError.message);
  }

  if (existingFollowError) {
    throw new Error(existingFollowError.message);
  }

  return {
    isFollowing: Boolean(existingFollow),
    followerCount: followerCount || 0,
    followingCount: followingCount || 0,
  };
}

async function verifyArtistExists(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  artistUserId: string,
) {
  const { data: artistProfile, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", artistUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(artistProfile);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artistUserId: string }> },
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { artistUserId } = await params;
    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const supabase = createSupabaseServiceRoleClient();
    const exists = await verifyArtistExists(supabase, artistUserId);
    if (!exists) {
      return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    }

    const state = await buildFollowState(supabase, userId, artistUserId);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artistUserId: string }> },
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { artistUserId } = await params;
    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    if (userId === artistUserId) {
      return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const exists = await verifyArtistExists(supabase, artistUserId);
    if (!exists) {
      return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    }

    const { error: insertError } = await supabase.from("follows").upsert({
      follower_user_id: userId,
      artist_user_id: artistUserId,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      await createAppNotification({
        recipientUserId: artistUserId,
        actorUserId: userId,
        type: "follow",
      });
    } catch (notificationError) {
      console.error("Failed to create follow notification:", notificationError);
    }

    const state = await buildFollowState(supabase, userId, artistUserId);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ artistUserId: string }> },
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { artistUserId } = await params;
    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const supabase = createSupabaseServiceRoleClient();
    const { error: deleteError } = await supabase
      .from("follows")
      .delete()
      .eq("follower_user_id", userId)
      .eq("artist_user_id", artistUserId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    try {
      await deleteAppNotification({
        recipientUserId: artistUserId,
        actorUserId: userId,
        type: "follow",
      });
    } catch (notificationError) {
      console.error("Failed to delete follow notification:", notificationError);
    }

    const state = await buildFollowState(supabase, userId, artistUserId);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
