import { NextResponse } from "next/server";
import { getCreatePasswordUrl } from "@/lib/app-url";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  isEmailNotificationsEnabled,
  sendApprovedInviteLinkEmail,
} from "@/lib/notifications/email";

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

function isAlreadyRegisteredAuthError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already registered");
}

function isEmailRateLimitAuthError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") && normalized.includes("email");
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

    const { userId, isAdmin, isModerator } = await ensureAppUser(auth.authUserId, auth.email);
    if (!isAdmin && !isModerator) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { requestId } = await params;
    if (!requestId) {
      return NextResponse.json({ error: "Missing request id." }, { status: 400 });
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

    const redirectTo = getCreatePasswordUrl();
    let linkType: "invite" | "recovery" = "invite";
    let sentViaResendFallback = false;
    let generatedActionLink: string | null = null;
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      inviteRequest.email,
      { redirectTo },
    );

    if (inviteError) {
      if (!isAlreadyRegisteredAuthError(inviteError.message || "")) {
        if (!isEmailRateLimitAuthError(inviteError.message || "")) {
          return NextResponse.json(
            { error: `Failed to send invite email: ${inviteError.message}` },
            { status: 500 },
          );
        }

        if (!isEmailNotificationsEnabled()) {
          return NextResponse.json(
            {
              error:
                "Email rate limit exceeded. Configure RESEND_API_KEY, FROM_EMAIL, and NOTIFY_OWNER_EMAIL to use fallback delivery.",
            },
            { status: 429 },
          );
        }

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: linkType,
          email: inviteRequest.email,
          options: { redirectTo },
        });

        if (linkError || !linkData?.properties?.action_link) {
          return NextResponse.json(
            { error: `Failed to generate fallback invite link: ${linkError?.message || "Unknown error."}` },
            { status: 500 },
          );
        }

        generatedActionLink = linkData.properties.action_link;
        await sendApprovedInviteLinkEmail({
          recipientEmail: inviteRequest.email,
          actionLink: generatedActionLink,
        });
        sentViaResendFallback = true;
      } else {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
          inviteRequest.email,
          { redirectTo },
        );
        if (recoveryError) {
          return NextResponse.json(
            { error: `Failed to send recovery email: ${recoveryError.message}` },
            { status: 500 },
          );
        }
        linkType = "recovery";
      }
    }

    // Optional secondary copy via Resend (non-blocking).
    if (!sentViaResendFallback && isEmailNotificationsEnabled()) {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: linkType,
        email: inviteRequest.email,
        options: { redirectTo },
      });

      if (!linkError && linkData?.properties?.action_link) {
        generatedActionLink = linkData.properties.action_link;
        try {
          await sendApprovedInviteLinkEmail({
            recipientEmail: inviteRequest.email,
            actionLink: generatedActionLink,
          });
        } catch (mailError) {
          console.error("Optional Resend invite copy failed:", mailError);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("invite_requests")
      .update({
        status: "approved",
        reviewed_by_user_id: userId,
        reviewed_at: nowIso,
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: invitesInsertError } = await supabase.from("invites").insert({
      code: crypto.randomUUID().replace(/-/g, ""),
      email: inviteRequest.email,
      status: "sent",
      created_by_user_id: userId,
      request_id: requestId,
      sent_at: nowIso,
      expires_at: expiresAt,
    });

    if (invitesInsertError) {
      console.error("Failed to insert invites record:", invitesInsertError.message);
    }

    return NextResponse.json({
      ok: true,
      requestId,
      email: inviteRequest.email,
      redirectTo,
      linkType,
      delivery: sentViaResendFallback ? "resend_fallback" : "supabase",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

