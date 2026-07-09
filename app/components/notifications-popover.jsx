"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, getStoredSupabaseAccessToken } from "@/lib/supabase/client";
import { buildPublicMediaPath, buildPublicProfilePath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";
import { MentionText } from "./mention-text";
import { ViewportPortal } from "./viewport-portal";

function getNotificationIcon(type) {
  if (type === "mention") {
    return <AtSign className="h-4 w-4" />;
  }

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

  if (notification.data?.source === "moderation") {
    const title = notification.data?.title || notification.media?.title || "your post";
    if (notification.data?.action === "deleted") {
      return `${actorName} deleted ${title} by moderation`;
    }

    return `${actorName} updated ${title} by moderation`;
  }

  if (notification.type === "follow") {
    return `${actorName} followed you`;
  }

  if (notification.type === "comment") {
    return `${actorName} commented on ${notification.media?.title || "your post"}`;
  }

  if (notification.type === "mention") {
    return `${actorName} mentioned you${notification.media?.title ? ` on ${notification.media.title}` : ""}`;
  }

  return `${actorName} liked ${notification.media?.title || "your post"}`;
}

function getActorInitial(notification) {
  const label = notification.actor?.displayName || notification.actor?.username || "?";
  return label.charAt(0).toUpperCase();
}

export function NotificationsPopover({ compact = false, onNavigate }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  const loadNotifications = async ({ markAsRead = false } = {}) => {
    setIsLoading(true);

    try {
      const accessToken = getStoredSupabaseAccessToken();
      if (!accessToken) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/notifications", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
            Authorization: `Bearer ${accessToken}`,
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
      const clickedPanel = panelRef.current?.contains(event.target);
      const clickedTrigger = rootRef.current?.contains(event.target);

      if (!clickedPanel && !clickedTrigger) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const handleOpenTarget = (notification) => {
    setIsOpen(false);
    onNavigate?.();

    if (notification.targetPath) {
      router.push(notification.targetPath);
      return;
    }

    if (notification.media?.username && notification.media?.slug) {
      router.push(buildPublicMediaPath(notification.media.username, notification.media.slug));
      return;
    }

    if (notification.actor?.username) {
      router.push(buildPublicProfilePath(notification.actor.username));
    }
  };

  const panel = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          ref={panelRef}
          className={`pointer-events-auto z-[9999] overflow-hidden rounded-[1.65rem] border border-white/10 bg-black p-3 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ${
            compact
              ? "fixed left-3 right-3 top-[5rem] max-h-[calc(100dvh-6rem)] w-auto"
              : "absolute right-0 top-[calc(100%+0.75rem)] w-[min(24rem,calc(100vw-2rem))]"
          }`}
          {...SOFT_PANEL_REVEAL}
          transition={PAGE_TRANSITION}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="px-3 pb-2 pt-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">
              notifications
            </p>
          </div>

          {isLoading ? (
            <div className="px-3 py-6 text-sm text-gray-400">loading notifications...</div>
          ) : notifications.length > 0 ? (
            <div
              className={`scrollbar-hidden overflow-y-auto ${
                compact ? "max-h-[calc(100dvh-11rem)]" : "max-h-[24rem]"
              }`}
            >
              {notifications.map((notification) => (
                <motion.button
                  key={notification.id}
                  type="button"
                  onClick={() => handleOpenTarget(notification)}
                  className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <div className="relative mt-0.5 h-11 w-11 flex-shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-sm text-gray-300">
                      {notification.actor?.avatarUrl ? (
                        <img
                          src={notification.actor.avatarUrl}
                          alt={notification.actor?.displayName || notification.actor?.username || "profile"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{getActorInitial(notification)}</span>
                      )}
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-black bg-white text-black">
                      {getNotificationIcon(notification.type)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{getNotificationText(notification)}</p>
                    {(notification.type === "comment" || notification.type === "mention") && notification.data?.bodyPreview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                        <MentionText text={notification.data.bodyPreview} />
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
            <div className="px-3 py-6 text-sm text-gray-400">no notifications yet.</div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="relative" ref={rootRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`relative flex items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white ${
          compact ? "h-12 w-12" : "h-11 w-11"
        }`}
        whileHover={SOFT_BUTTON_HOVER}
        whileTap={SOFT_BUTTON_TAP}
        aria-label="Open notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5.5 min-w-5.5 items-center justify-center rounded-full border border-black bg-red-500 px-1.5 text-center text-[10px] font-semibold leading-none text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </motion.button>

      {compact ? <ViewportPortal>{panel}</ViewportPortal> : panel}
    </div>
  );
}
