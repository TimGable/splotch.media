import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendInviteRequestNotification } from "@/lib/notifications/email";
import { createInviteEmailActionToken } from "@/lib/invite-request-email-actions";

type InviteRequestPayload = {
  email?: string;
  message?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  let payload: InviteRequestPayload;

  try {
    payload = (await request.json()) as InviteRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  const message = payload.message?.trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  if (!message || message.length < 10 || message.length > 2000) {
    return NextResponse.json(
      { error: "Message must be between 10 and 2000 characters." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const nowIso = new Date().toISOString();

    const { data: existingPendingRequests, error: existingPendingError } = await supabase
      .from("invite_requests")
      .select("id")
      .eq("email", email)
      .eq("status", "pending");

    if (existingPendingError) {
      return NextResponse.json({ error: existingPendingError.message }, { status: 500 });
    }

    const pendingIds = (existingPendingRequests ?? []).map((requestRow) => requestRow.id);
    if (pendingIds.length > 0) {
      const { error: withdrawError } = await supabase
        .from("invite_requests")
        .update({
          status: "withdrawn",
          reviewed_at: nowIso,
          review_note: "Superseded by a newer invite request from the same email.",
        })
        .in("id", pendingIds);

      if (withdrawError) {
        return NextResponse.json({ error: withdrawError.message }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("invite_requests")
      .insert({
        email,
        message,
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let notificationError: string | null = null;
    try {
      const baseUrl = getAppBaseUrl();
      const approveToken = createInviteEmailActionToken(data.id, "approve");
      const denyToken = createInviteEmailActionToken(data.id, "deny");
      const approveUrl = `${baseUrl}/api/admin/invite-requests/email-action?requestId=${encodeURIComponent(
        data.id,
      )}&action=approve&token=${encodeURIComponent(approveToken)}`;
      const denyUrl = `${baseUrl}/api/admin/invite-requests/email-action?requestId=${encodeURIComponent(
        data.id,
      )}&action=deny&token=${encodeURIComponent(denyToken)}`;

      await sendInviteRequestNotification({
        requesterEmail: email,
        message,
        requestId: data.id,
        createdAt: data.created_at,
        approveUrl,
        denyUrl,
      });
    } catch (emailError) {
      console.error("Failed to send invite request notification email:", emailError);
      notificationError =
        emailError instanceof Error ? emailError.message : "Invite notification email failed.";
    }

    return NextResponse.json(
      {
        inviteRequest: data,
        replacedPendingRequests: pendingIds.length,
        notificationError,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
