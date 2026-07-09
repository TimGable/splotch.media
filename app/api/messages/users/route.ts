import { NextResponse } from "next/server";
import { createSignedAvatarUrl } from "@/lib/messages/avatar";
import {
  ensureAppUser,
  ensureProfile,
  getAuthContext,
} from "@/lib/supabase/app-user";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const USER_LIMIT = 30;

function normalizeSearch(value: string | null) {
  return String(value || "")
    .trim()
    .replace(/[%_,()]/g, "")
    .slice(0, 48);
}

function getRelationshipRank(userId: string, followingIds: Set<string>, followerIds: Set<string>) {
  const isFollowing = followingIds.has(userId);
  const isFollower = followerIds.has(userId);

  if (isFollowing && isFollower) return 0;
  if (isFollowing) return 1;
  if (isFollower) return 2;
  return 3;
}

function getRelationshipLabel(userId: string, followingIds: Set<string>, followerIds: Set<string>) {
  const isFollowing = followingIds.has(userId);
  const isFollower = followerIds.has(userId);

  if (isFollowing && isFollower) return "mutual";
  if (isFollowing) return "following";
  if (isFollower) return "follows you";
  return "artist";
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const { searchParams } = new URL(request.url);
    const query = normalizeSearch(searchParams.get("q"));
    const supabase = createSupabaseServiceRoleClient();

    const [
      { data: followingRows, error: followingError },
      { data: followerRows, error: followerError },
    ] = await Promise.all([
      supabase
        .from("follows")
        .select("artist_user_id")
        .eq("follower_user_id", userId),
      supabase
        .from("follows")
        .select("follower_user_id")
        .eq("artist_user_id", userId),
    ]);

    if (followingError) {
      return NextResponse.json({ error: followingError.message }, { status: 500 });
    }

    if (followerError) {
      return NextResponse.json({ error: followerError.message }, { status: 500 });
    }

    const followingIds = new Set((followingRows ?? []).map((row) => row.artist_user_id).filter(Boolean));
    const followerIds = new Set((followerRows ?? []).map((row) => row.follower_user_id).filter(Boolean));

    let profileQuery = supabase
      .from("profiles")
      .select("user_id, username, display_name, bio, avatar_asset_id")
      .neq("user_id", userId)
      .limit(120);

    if (query) {
      profileQuery = profileQuery.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`);
    }

    const { data: profiles, error: profilesError } = await profileQuery;
    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const rankedProfiles = [...(profiles ?? [])]
      .sort((first, second) => {
        const firstRank = getRelationshipRank(first.user_id, followingIds, followerIds);
        const secondRank = getRelationshipRank(second.user_id, followingIds, followerIds);

        if (firstRank !== secondRank) return firstRank - secondRank;

        const firstName = String(first.display_name || first.username || "").toLowerCase();
        const secondName = String(second.display_name || second.username || "").toLowerCase();
        return firstName.localeCompare(secondName);
      })
      .slice(0, USER_LIMIT);

    const users = await Promise.all(
      rankedProfiles.map(async (profile) => ({
        userId: profile.user_id,
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio || "",
        avatarUrl: await createSignedAvatarUrl(supabase, profile.avatar_asset_id),
        relationshipLabel: getRelationshipLabel(profile.user_id, followingIds, followerIds),
      })),
    );

    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
