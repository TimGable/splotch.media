"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Inbox, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, getStoredSupabaseAccessToken } from "@/lib/supabase/client";
import { SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP } from "@/lib/motion";

export function MessagesNavButton({ compact = false }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    const accessToken = getStoredSupabaseAccessToken();
    if (!accessToken) {
      setUnreadCount(0);
      return;
    }

    const response = await fetch("/api/messages", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUnreadCount(0);
      return;
    }

    setUnreadCount(Number(payload?.unreadCount || 0));
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadUnreadCount, 0);

    const intervalId = window.setInterval(loadUnreadCount, 30000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(loadUnreadCount);

    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, [loadUnreadCount, supabase]);

  return (
    <motion.button
      type="button"
      onClick={() => router.push("/messages")}
      className={`relative flex items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white ${
        compact ? "h-12 w-12" : "h-11 w-11"
      }`}
      whileHover={SOFT_BUTTON_HOVER}
      whileTap={SOFT_BUTTON_TAP}
      aria-label="Open messages"
    >
      {unreadCount > 0 ? <MessageSquare className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
      {unreadCount > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex min-h-5.5 min-w-5.5 items-center justify-center rounded-full border border-black bg-red-500 px-1.5 text-center text-[10px] font-semibold leading-none text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </motion.button>
  );
}
