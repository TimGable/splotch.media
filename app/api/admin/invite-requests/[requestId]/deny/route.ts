import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendDeniedInviteEmail } from "@/lib/notifications/email";

type AuthContext = {
  authUserId: string;
  email: string;
};

function extractBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const authClient = createSupabaseServerClient();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user?.id || !data.user.email) return null;

  return {
    authUserId: data.user.id,
    email: data.user.email.toLowerCase(),
  };
}

async function ensureAppUser(authUserId: string, email: string) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: byAuthUser, error: byAuthUserError } = await supabase
    .from("users")
    .select("id, email, is_admin")
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
        .select("id, is_admin")
        .single();

      if (updateError || !updated?.id) {
        throw new Error(updateError?.message ?? "Failed to update app user email.");
      }

      return { userId: updated.id as string, isAdmin: Boolean(updated.is_admin) };
    }

    return { userId: byAuthUser.id as string, isAdmin: Boolean(byAuthUser.is_admin) };
  }

  const { data: byEmail, error: byEmailError } = await supabase
    .from("users")
    .select("id, auth_user_id, is_admin")
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
        .select("id, is_admin")
        .single();

      if (updateError || !updated?.id) {
        throw new Error(updateError?.message ?? "Failed to link app user.");
      }

      return { userId: updated.id as string, isAdmin: Boolean(updated.is_admin) };
    }

    return { userId: byEmail.id as string, isAdmin: Boolean(byEmail.is_admin) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      auth_user_id: authUserId,
      email,
      is_admin: false,
    })
    .select("id, is_admin")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Failed to ensure app user.");
  }

  return { userId: inserted.id as string, isAdmin: Boolean(inserted.is_admin) };
}

type Params = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId, isAdmin } = await ensureAppUser(auth.authUserId, auth.email);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { requestId } = await params;
    if (!requestId) {
      return NextResponse.json({ error: "Missing request id." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return NextResponse.json({ error: "A denial reason is required." }, { status: 400 });
    }

    if (reason.length > 1200) {
      return NextResponse.json(
        { error: "Denial reason is too long (max 1200 characters)." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceRoleClient();

    const { data: inviteRequest, error: fetchError } = await supabase
      .from("invite_requests")
      .select("id, email, status")
      .eq("id", requestId)
      .single();

    if (fetchError || !inviteRequest) {
      return NextResponse.json({ error: "Invite request not found." }, { status: 404 });
    }

    if (inviteRequest.status !== "pending") {
      return NextResponse.json(
        { error: `Invite request already ${inviteRequest.status}.` },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("invite_requests")
      .update({
        status: "rejected",
        reviewed_by_user_id: userId,
        reviewed_at: nowIso,
        review_note: reason,
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    try {
      await sendDeniedInviteEmail({
        recipientEmail: inviteRequest.email,
        reason,
      });
    } catch (mailError) {
      console.error("Failed to send denied invite email:", mailError);
    }

    return NextResponse.json({
      ok: true,
      requestId,
      email: inviteRequest.email,
      reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
