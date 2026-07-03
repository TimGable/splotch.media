import { Resend } from "resend";

const RESEND_DELIVERY_TOKEN = process.env.RESEND_DELIVERY_TOKEN;
const NOTIFY_OWNER_EMAIL = process.env.NOTIFY_OWNER_EMAIL;
const NOTIFY_INVITE_REQUEST_EMAILS = process.env.NOTIFY_INVITE_REQUEST_EMAILS;
const FROM_EMAIL = process.env.FROM_EMAIL;

function getInviteNotificationRecipients() {
  const rawRecipients = NOTIFY_INVITE_REQUEST_EMAILS || NOTIFY_OWNER_EMAIL || "";
  return rawRecipients
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function hasEmailConfig() {
  return Boolean(RESEND_DELIVERY_TOKEN && FROM_EMAIL && getInviteNotificationRecipients().length > 0);
}

export function isEmailNotificationsEnabled() {
  return hasEmailConfig();
}

export function getEmailDeliveryErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Email delivery failed.";
  if (message.toLowerCase().includes("only send testing emails")) {
    return [
      message,
      "Resend is still in testing mode for this sender. Verify splotchmedia.com in Resend, then set FROM_EMAIL to an address on that domain, such as Our Media Archive <invites@splotchmedia.com>.",
    ].join(" ");
  }

  return message;
}

async function sendEmailOrThrow(
  resend: Resend,
  payload: Parameters<typeof resend.emails.send>[0],
) {
  const result = await resend.emails.send(payload);
  if (result.error) {
    throw new Error(result.error.message || "Email delivery failed.");
  }

  return result.data;
}

export async function sendInviteRequestNotification(params: {
  requesterEmail: string;
  message: string;
  requestId: string;
  createdAt: string;
  approveUrl?: string;
  denyUrl?: string;
}) {
  if (!hasEmailConfig()) return;

  const resend = new Resend(RESEND_DELIVERY_TOKEN);

  const subject = `New invite request: ${params.requesterEmail}`;
  const text = [
    "You received a new invite request.",
    "",
    `Request ID: ${params.requestId}`,
    `Submitted: ${params.createdAt}`,
    `Email: ${params.requesterEmail}`,
    "",
    "Message:",
    params.message,
    "",
    params.approveUrl ? `Approve: ${params.approveUrl}` : "",
    params.denyUrl ? `Deny: ${params.denyUrl}` : "",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #e5e5e5; background: #0b0b0b; padding: 24px;">
      <h2 style="margin: 0 0 12px 0; color: #ffffff;">New invite request</h2>
      <p style="margin: 0 0 8px 0;"><strong>Request ID:</strong> ${params.requestId}</p>
      <p style="margin: 0 0 8px 0;"><strong>Submitted:</strong> ${params.createdAt}</p>
      <p style="margin: 0 0 16px 0;"><strong>Email:</strong> ${params.requesterEmail}</p>
      <p style="margin: 0 0 8px 0;"><strong>Message:</strong></p>
      <div style="border: 1px solid #2a2a2a; padding: 12px; background: #111111; white-space: pre-wrap;">${params.message}</div>
      ${
        params.approveUrl && params.denyUrl
          ? `<div style="margin-top: 20px;">
              <a href="${params.approveUrl}" style="display: inline-block; margin-right: 10px; padding: 10px 14px; background: #16a34a; color: white; text-decoration: none; border-radius: 4px;">Approve</a>
              <a href="${params.denyUrl}" style="display: inline-block; padding: 10px 14px; background: #dc2626; color: white; text-decoration: none; border-radius: 4px;">Deny</a>
            </div>`
          : ""
      }
    </div>
  `;

  await sendEmailOrThrow(resend, {
    from: FROM_EMAIL as string,
    to: getInviteNotificationRecipients(),
    subject,
    text,
    html,
  });
}

export async function sendApprovedInviteLinkEmail(params: {
  recipientEmail: string;
  actionLink: string;
}) {
  if (!hasEmailConfig()) return;

  const resend = new Resend(RESEND_DELIVERY_TOKEN);

  const subject = "Your invite was approved - set your password";
  const text = [
    "Your invite request for Splotch has been approved.",
    "",
    "Use the secure link below to create your password and activate your account:",
    params.actionLink,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  await sendEmailOrThrow(resend, {
    from: FROM_EMAIL as string,
    to: [params.recipientEmail],
    subject,
    text,
  });
}

export async function sendDeniedInviteEmail(params: {
  recipientEmail: string;
  reason: string;
}) {
  if (!hasEmailConfig()) return;

  const resend = new Resend(RESEND_DELIVERY_TOKEN);

  const subject = "Your invite request was not approved";
  const text = [
    "Thanks for your interest in Splotch.",
    "",
    "At this time, your invite request was not approved.",
    "",
    "Reason from the admin team:",
    params.reason,
    "",
    "You can submit another request in the future if your circumstances change.",
  ].join("\n");

  await sendEmailOrThrow(resend, {
    from: FROM_EMAIL as string,
    to: [params.recipientEmail],
    subject,
    text,
  });
}
