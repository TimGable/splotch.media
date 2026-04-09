import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function createSignedAvatarUrl(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  avatarAssetId: string | null,
) {
  if (!avatarAssetId) {
    return null;
  }

  const { data: avatarAsset, error: avatarAssetError } = await supabase
    .from("media_assets")
    .select("bucket, object_key")
    .eq("id", avatarAssetId)
    .maybeSingle();

  if (avatarAssetError) {
    throw new Error(avatarAssetError.message);
  }

  if (!avatarAsset?.bucket || !avatarAsset.object_key) {
    return null;
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(avatarAsset.bucket)
    .createSignedUrl(avatarAsset.object_key, SIGNED_URL_TTL_SECONDS);

  if (signedError) {
    return null;
  }

  return signedData?.signedUrl ?? null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = String(searchParams.get("username") || "").trim().toLowerCase();
    const type = String(searchParams.get("type") || "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "A username is required." }, { status: 400 });
    }

    if (type !== "followers" && type !== "following") {
      return NextResponse.json({ error: "Type must be followers or following." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
    }

    if (!targetProfile?.user_id) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const relationshipColumn =
      type === "followers" ? "follower_user_id" : "artist_user_id";
    const filterColumn =
      type === "followers" ? "artist_user_id" : "follower_user_id";

    const { data: relationshipRows, error: relationshipRowsError } = await supabase
      .from("follows")
      .select(relationshipColumn)
      .eq(filterColumn, targetProfile.user_id);

    if (relationshipRowsError) {
      return NextResponse.json({ error: relationshipRowsError.message }, { status: 500 });
    }

    const userIds = (relationshipRows ?? [])
      .map((row) => row[relationshipColumn])
      .filter((value): value is string => Boolean(value));

    if (userIds.length === 0) {
      return NextResponse.json({ connections: [] });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, bio, avatar_asset_id")
      .in("user_id", userIds);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const profileByUserId = new Map(
      (profiles ?? []).map((profile) => [profile.user_id, profile]),
    );

    const orderedConnections = [];
    for (const userId of userIds) {
      const profile = profileByUserId.get(userId);
      if (!profile?.username) {
        continue;
      }

      orderedConnections.push({
        userId: profile.user_id,
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio || "",
        avatarUrl: await createSignedAvatarUrl(supabase, profile.avatar_asset_id),
      });
    }

    return NextResponse.json({ connections: orderedConnections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
