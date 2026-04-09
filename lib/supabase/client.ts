import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserStorageKey() {
  const { url } = getSupabasePublicConfig();
  const baseUrl = new URL(url);
  return `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
}

export function getStoredSupabaseUserId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawSession = window.localStorage.getItem(getSupabaseBrowserStorageKey());
    if (!rawSession) {
      return null;
    }

    const parsed = JSON.parse(rawSession);

    if (parsed?.user?.id) {
      return parsed.user.id;
    }

    if (parsed?.currentSession?.user?.id) {
      return parsed.currentSession.user.id;
    }

    if (parsed?.session?.user?.id) {
      return parsed.session.user.id;
    }

    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry?.user?.id) {
          return entry.user.id;
        }

        if (entry?.currentSession?.user?.id) {
          return entry.currentSession.user.id;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function createSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  browserClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
