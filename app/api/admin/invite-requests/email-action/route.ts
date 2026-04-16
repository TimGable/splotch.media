import { NextResponse } from "next/server";
import { getCreatePasswordUrl } from "@/lib/app-url";
import {
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  getEmailDeliveryErrorMessage,
  isEmailNotificationsEnabled,
  sendApprovedInviteLinkEmail,
  sendDeniedInviteEmail,
} from "@/lib/notifications/email";
import {
  verifyInviteEmailActionToken,
  type InviteEmailAction,
} from "@/lib/invite-request-email-actions";

function isAlreadyRegisteredAuthError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already registered");
}

function isEmailRateLimitAuthError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") && normalized.includes("email");
}

function renderHtml(title: string, message: string, status: "success" | "error" | "info") {
  const accent =
    status === "success" ? "#16a34a" : status === "error" ? "#dc2626" : "#9ca3af";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
    </head>
    <body style="margin:0;background:#050505;color:#f5f5f5;font-family:Arial,sans-serif;">
      <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
        <section style="width:100%;max-width:560px;border:1px solid #2a2a2a;background:#0c0c0c;padding:24px;">
          <div style="width:40px;height:4px;background:${accent};margin-bottom:16px;"></div>
          <h1 style="margin:0 0 12px 0;font-size:26px;">${title}</h1>
          <p style="margin:0;color:#d4d4d4;line-height:1.6;white-space:pre-wrap;">${message}</p>
        </section>
      </main>
    </body>
  </html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim();
  const action = url.searchParams.get("action")?.trim() as InviteEmailAction | null;
  const token = url.searchParams.get("token")?.trim();

  if (!requestId || !token || (action !== "approve" && action !== "deny")) {
    return new NextResponse(
      renderHtml("Invalid action link", "This email action link is incomplete or malformed.", "error"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const verification = verifyInviteEmailActionToken(token, requestId, action);
  if (!verification.valid) {
    return new NextResponse(
      renderHtml("Invalid action link", verification.error, "error"),
      { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  try {
    const supabase = createSupabaseServiceRoleClient();

    const { data: inviteRequest, error: fetchError } = await supabase
      .from("invite_requests")
      .select("id, email, status")
      .eq("id", requestId)
      .single();

    if (fetchError || !inviteRequest) {
      return new NextResponse(
        renderHtml("Request not found", "This invite request no longer exists.", "error"),
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if (inviteRequest.status !== "pending") {
      return new NextResponse(
        renderHtml(
          "Already handled",
          `This invite request was already ${inviteRequest.status}. No further action was taken.`,
          "info",
        ),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const nowIso = new Date().toISOString();

    if (action === "deny") {
      const reason = "Denied by administrator via email action.";

      const { error: updateError } = await supabase
        .from("invite_requests")
        .update({
          status: "rejected",
          reviewed_at: nowIso,
          review_note: reason,
        })
        .eq("id", requestId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      try {
        await sendDeniedInviteEmail({ recipientEmail: inviteRequest.email, reason });
      } catch (mailError) {
        console.error("Failed to send denied invite email from email action:", mailError);
      }

      return new NextResponse(
        renderHtml("Request denied", `You denied the invite request for ${inviteRequest.email}.`, "success"),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const redirectTo = getCreatePasswordUrl();
    let linkType: "invite" | "recovery" = "invite";
    let sentViaResendFallback = false;
    let generatedActionLink: string | null = null;
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(inviteRequest.email, {
      redirectTo,
    });

    if (inviteError) {
      if (!isAlreadyRegisteredAuthError(inviteError.message || "")) {
        if (!isEmailRateLimitAuthError(inviteError.message || "")) {
          throw new Error(`Failed to send invite email: ${inviteError.message}`);
        }

        if (!isEmailNotificationsEnabled()) {
          throw new Error(
            "Email rate limit exceeded and Resend fallback is not configured. Set RESEND_API_KEY, FROM_EMAIL, and NOTIFY_OWNER_EMAIL.",
          );
        }

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: linkType,
          email: inviteRequest.email,
          options: { redirectTo },
        });

        if (linkError || !linkData?.properties?.action_link) {
          throw new Error(`Failed to generate fallback invite link: ${linkError?.message || "Unknown error."}`);
        }

        generatedActionLink = linkData.properties.action_link;
        try {
          await sendApprovedInviteLinkEmail({
            recipientEmail: inviteRequest.email,
            actionLink: generatedActionLink,
          });
        } catch (mailError) {
          throw new Error(getEmailDeliveryErrorMessage(mailError));
        }
        sentViaResendFallback = true;
      } else {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
          inviteRequest.email,
          { redirectTo },
        );
        if (recoveryError) {
          if (isEmailRateLimitAuthError(recoveryError.message || "") && isEmailNotificationsEnabled()) {
            linkType = "recovery";
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: linkType,
              email: inviteRequest.email,
              options: { redirectTo },
            });

            if (linkError || !linkData?.properties?.action_link) {
              throw new Error(`Failed to generate fallback recovery link: ${linkError?.message || "Unknown error."}`);
            }

            generatedActionLink = linkData.properties.action_link;
            try {
              await sendApprovedInviteLinkEmail({
                recipientEmail: inviteRequest.email,
                actionLink: generatedActionLink,
              });
            } catch (mailError) {
              throw new Error(getEmailDeliveryErrorMessage(mailError));
            }
            sentViaResendFallback = true;
          } else if (isEmailRateLimitAuthError(recoveryError.message || "")) {
            throw new Error(
              "Recovery email rate limit exceeded and Resend fallback is not configured. Set RESEND_API_KEY, FROM_EMAIL, and NOTIFY_OWNER_EMAIL.",
            );
          } else {
          throw new Error(`Failed to send recovery email: ${recoveryError.message}`);
          }
        } else {
          linkType = "recovery";
        }
      }
    }

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
          console.error("Optional Resend invite copy failed for email action:", mailError);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("invite_requests")
      .update({
        status: "approved",
        reviewed_at: nowIso,
      })
      .eq("id", requestId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: invitesInsertError } = await supabase.from("invites").insert({
      code: crypto.randomUUID().replace(/-/g, ""),
      email: inviteRequest.email,
      status: "sent",
      request_id: requestId,
      sent_at: nowIso,
      expires_at: expiresAt,
    });

    if (invitesInsertError) {
      console.error("Failed to insert invites record for email action:", invitesInsertError.message);
    }

    return new NextResponse(
      renderHtml(
        "Request approved",
        `You approved the invite request for ${inviteRequest.email}.\nA sign-in link has been sent to that email.`,
        "success",
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return new NextResponse(renderHtml("Action failed", message, "error"), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

