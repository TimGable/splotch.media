import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "./server";

export type AuthContext = {
  authUserId: string;
  email: string;
};

export function extractBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  // Trust Supabase auth for identity, then map it into our app-owned user table below.
  const authClient = createSupabaseServerClient();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user?.id || !data.user.email) return null;

  return {
    authUserId: data.user.id,
    email: data.user.email.toLowerCase(),
  };
}

export async function ensureAppUser(authUserId: string, email: string) {
  const supabase = createSupabaseServiceRoleClient();

  // Auth users and app users can be created at different moments, so this keeps
  // the two records linked without silently taking over someone else's email.
  const { data: byAuthUser, error: byAuthUserError } = await supabase
    .from("users")
    .select("id, email, is_admin, is_moderator")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthUserError) {
    throw new Error(byAuthUserError.message);
  }

  if (byAuthUser?.id) {
    if (byAuthUser.email !== email) {
      const { data: emailOwner, error: emailOwnerError } = await supabase
        .from("users")
        .select("id, auth_user_id")
        .eq("email", email)
        .maybeSingle();

      if (emailOwnerError) {
        throw new Error(emailOwnerError.message);
      }

      if (emailOwner?.id && emailOwner.id !== byAuthUser.id) {
        throw new Error("Email is already linked to a different auth account.");
      }

      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ email })
        .eq("id", byAuthUser.id)
        .select("id, is_admin, is_moderator")
        .single();

      if (updateError || !updated?.id) {
        throw new Error(updateError?.message ?? "Failed to update app user email.");
      }

      return {
        userId: updated.id as string,
        isAdmin: Boolean(updated.is_admin),
        isModerator: Boolean(updated.is_moderator),
      };
    }

    return {
      userId: byAuthUser.id as string,
      isAdmin: Boolean(byAuthUser.is_admin),
      isModerator: Boolean(byAuthUser.is_moderator),
    };
  }

  const { data: byEmail, error: byEmailError } = await supabase
    .from("users")
    .select("id, auth_user_id, is_admin, is_moderator")
    .eq("email", email)
    .maybeSingle();

  if (byEmailError) {
    throw new Error(byEmailError.message);
  }

  if (byEmail?.id) {
    if (byEmail.auth_user_id && byEmail.auth_user_id !== authUserId) {
      throw new Error("Email is already linked to a different auth account.");
    }

    if (!byEmail.auth_user_id) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ auth_user_id: authUserId })
        .eq("id", byEmail.id)
        .select("id, is_admin, is_moderator")
        .single();

      if (updateError || !updated?.id) {
        throw new Error(updateError?.message ?? "Failed to link app user.");
      }

      return {
        userId: updated.id as string,
        isAdmin: Boolean(updated.is_admin),
        isModerator: Boolean(updated.is_moderator),
      };
    }

    return {
      userId: byEmail.id as string,
      isAdmin: Boolean(byEmail.is_admin),
      isModerator: Boolean(byEmail.is_moderator),
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      auth_user_id: authUserId,
      email,
      is_admin: false,
      is_moderator: false,
    })
    .select("id, is_admin, is_moderator")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Failed to ensure app user.");
  }

  return {
    userId: inserted.id as string,
    isAdmin: Boolean(inserted.is_admin),
    isModerator: Boolean(inserted.is_moderator),
  };
}

function toBaseUsername(email: string) {
  const localPart = email.split("@")[0] ?? "user";
  const cleaned = localPart.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return cleaned.slice(0, 24) || "user";
}

export async function ensureProfile(userId: string, email: string) {
  const supabase = createSupabaseServiceRoleClient();

  // Profiles are created lazily so invite/account creation can stay focused on auth.
  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, bio")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    return existing;
  }

  const username = `${toBaseUsername(email)}_${userId.slice(0, 8)}`;
  const displayName = email.split("@")[0] ?? "new user";

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      username,
      display_name: displayName,
      bio: "",
    })
    .select("user_id, username, display_name, bio")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted;
}
