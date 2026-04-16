const LOCAL_APP_BASE_URL = "http://localhost:3000";

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getAppBaseUrl() {
  return normalizeBaseUrl(
    process.env.APP_BASE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      LOCAL_APP_BASE_URL,
  );
}

export function getCreatePasswordUrl() {
  return `${getAppBaseUrl()}/create-password`;
}
