import { createHmac, timingSafeEqual } from "crypto";

export type InviteEmailAction = "approve" | "deny";

type InviteEmailActionPayload = {
  requestId: string;
  action: InviteEmailAction;
};

function getInviteEmailActionSecret() {
  return process.env.INVITE_EMAIL_ACTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value: string) {
  const secret = getInviteEmailActionSecret();
  if (!secret) {
    throw new Error("Missing INVITE_EMAIL_ACTION_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createInviteEmailActionToken(
  requestId: string,
  action: InviteEmailAction,
) {
  const payload: InviteEmailActionPayload = {
    requestId,
    action,
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyInviteEmailActionToken(
  token: string,
  requestId: string,
  action: InviteEmailAction,
) {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return { valid: false, error: "Invalid token format." as const };
  }

  let payload: InviteEmailActionPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded)) as InviteEmailActionPayload;
  } catch {
    return { valid: false, error: "Invalid token payload." as const };
  }

  if (payload.requestId !== requestId || payload.action !== action) {
    return { valid: false, error: "Token does not match request/action." as const };
  }

  const expectedSignature = sign(payloadEncoded);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, error: "Invalid token signature." as const };
  }

  return { valid: true as const };
}
