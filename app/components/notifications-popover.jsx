"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildPublicMediaPath, buildPublicProfilePath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

function getNotificationIcon(type) {
  if (type === "follow") {
    return <UserPlus className="h-4 w-4" />;
  }

  if (type === "comment") {
    return <MessageCircle className="h-4 w-4" />;
  }

  return <Heart className="h-4 w-4" />;
}

function getNotificationText(notification) {
  const actorName = notification.actor?.displayName || notification.actor?.username || "someone";

  if (notification.type === "follow") {
    return `${actorName} followed you`;
  }

  if (notification.type === "comment") {
    return `${actorName} commented on ${notification.media?.title || "your post"}`;
  }

  return `${actorName} liked ${notification.media?.title || "your post"}`;
}

export function NotificationsPopover({ compact = false, onNavigate }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef(null);

  const loadNotifications = async ({ markAsRead = false } = {}) => {
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/notifications", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      setUnreadCount(Number(payload?.unreadCount || 0));

      if (markAsRead && Number(payload?.unreadCount || 0) > 0) {
        await fetch("/api/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "mark-all-read" }),
        }).catch(() => {});
        setUnreadCount(0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadNotifications();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    loadNotifications({ markAsRead: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const handleOpenTarget = (notification) => {
    setIsOpen(false);
    onNavigate?.();

    if (notification.media?.username && notification.media?.slug) {
      router.push(buildPublicMediaPath(notification.media.username, notification.media.slug));
      return;
    }

    if (notification.actor?.username) {
      router.push(buildPublicProfilePath(notification.actor.username));
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`relative flex items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white ${
          compact ? "h-11 w-11" : "h-10 w-10"
        }`}
        whileHover={SOFT_BUTTON_HOVER}
        whileTap={SOFT_BUTTON_TAP}
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border border-black bg-red-500 px-1.5 text-center text-[10px] font-semibold leading-none text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </motion.button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className={`absolute z-30 overflow-hidden border border-white/15 bg-black/96 shadow-[0_18px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl ${
              compact
                ? "left-0 top-[calc(100%+0.75rem)] w-[min(22rem,calc(100vw-3rem))]"
                : "right-0 top-[calc(100%+0.75rem)] w-[min(24rem,calc(100vw-2rem))]"
            }`}
            {...SOFT_PANEL_REVEAL}
            transition={PAGE_TRANSITION}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">
                notifications
              </p>
            </div>

            {isLoading ? (
              <div className="px-4 py-6 text-sm text-gray-500">loading notifications...</div>
            ) : notifications.length > 0 ? (
              <div className="scrollbar-hidden max-h-[24rem] overflow-y-auto">
                {notifications.map((notification) => (
                  <motion.button
                    key={notification.id}
                    type="button"
                    onClick={() => handleOpenTarget(notification)}
                    className="flex w-full items-start gap-3 border-b border-white/10 px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.04]"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-gray-300">
                      {getNotificationIcon(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">{getNotificationText(notification)}</p>
                      {notification.type === "comment" && notification.data?.bodyPreview ? (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                          {notification.data.bodyPreview}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                        {notification.createdAtLabel}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500">no notifications yet.</div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
