"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, MessageSquare, MoreHorizontal, Search, Send, Trash2, UserPlus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSupabaseBrowserClient,
  getStoredSupabaseAccessToken,
} from "@/lib/supabase/client";
import { buildPublicProfilePath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";
import { ViewportPortal } from "./viewport-portal";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_SURFACE_TRANSITION = {
  duration: 0.56,
  ease: [0.22, 1, 0.36, 1],
};
const MESSAGE_SURFACE_REVEAL = {
  initial: { opacity: 0, y: 12, scale: 0.985, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, scale: 0.992, filter: "blur(8px)" },
};
const THREAD_FADE_REVEAL = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(6px)" },
};
const CONVERSATION_FADE_REVEAL = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(6px)" },
};
const COMPOSER_FADE_REVEAL = {
  initial: { opacity: 0, filter: "blur(8px)", scale: 0.992 },
  animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
  exit: { opacity: 0, filter: "blur(6px)", scale: 0.996 },
};
const MESSAGE_ITEM_REVEAL = {
  initial: { opacity: 0, y: 10, filter: "blur(7px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(6px)" },
};

function getInitial(conversation) {
  const label = conversation.participant?.displayName || conversation.participant?.username || "?";
  return label.charAt(0).toUpperCase();
}

function getParticipantName(conversation) {
  return conversation?.participant?.displayName || conversation?.participant?.username || "unknown user";
}

function ConversationAvatar({ conversation, size = "h-12 w-12" }) {
  return (
    <div className={`relative flex-shrink-0 ${size}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-sm text-gray-300">
        {conversation?.participant?.avatarUrl ? (
          <img
            src={conversation.participant.avatarUrl}
            alt={getParticipantName(conversation)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{conversation ? getInitial(conversation) : "?"}</span>
        )}
      </div>
      {conversation?.isUnread ? (
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border border-black bg-red-500" />
      ) : null}
    </div>
  );
}

function UserAvatar({ user, size = "h-10 w-10" }) {
  const initial = (user?.displayName || user?.username || "?").charAt(0).toUpperCase();

  return (
    <div className={`flex ${size} flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-sm text-gray-300`}>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName || user.username || "profile"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

function MessageBubble({ message, conversation }) {
  const isOwn = Boolean(message.isOwn);
  const participantName = getParticipantName(conversation);
  const participantInitial = getInitial(conversation);

  return (
    <motion.div
      className={`flex w-full items-end gap-2 ${isOwn ? "justify-end pl-12 md:pl-32" : "justify-start pr-12 md:pr-32"}`}
      {...THREAD_FADE_REVEAL}
      transition={MESSAGE_SURFACE_TRANSITION}
    >
      {!isOwn ? (
        <Avatar className="h-7 w-7 border border-white/10 bg-white/[0.04] text-[11px] text-gray-300">
          {conversation?.participant?.avatarUrl ? (
            <AvatarImage
              src={conversation.participant.avatarUrl}
              alt={participantName}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="bg-white/[0.04] text-gray-300">
            {participantInitial}
          </AvatarFallback>
        </Avatar>
      ) : null}

      <div
        className={`relative max-w-[min(30rem,76%)] px-3.5 py-2 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
          isOwn
            ? "rounded-[1.1rem] rounded-br-[0.55rem] border border-white/12 bg-[#27292d] text-white"
            : "rounded-[1.1rem] rounded-bl-[0.55rem] border border-white/10 bg-[#151619] text-gray-100"
        }`}
      >
        <p className="relative whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        <p className="relative mt-1 text-[9px] text-gray-500">
          {message.createdAtLabel}
        </p>
      </div>
    </motion.div>
  );
}

function NewMessagePanel({
  isOpen,
  onClose,
  onSelectUser,
  getAccessToken,
  anchorRect,
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setError("");

      try {
        const accessToken = await getAccessToken();
        if (!accessToken || cancelled) {
          return;
        }

        const response = await fetch(`/api/messages/users?q=${encodeURIComponent(query)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) {
            setError(payload?.error || "failed to search users.");
          }
          return;
        }

        if (!cancelled) {
          setUsers(Array.isArray(payload?.users) ? payload.users : []);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [getAccessToken, isOpen, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setUsers([]);
      setError("");
      setIsSearching(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const viewportWidth = typeof window === "undefined" ? 420 : window.innerWidth;
  const panelWidth = Math.min(anchorRect?.width || 352, 420, viewportWidth - 24);
  const panelLeft = Math.max(12, Math.min(anchorRect?.left || 12, viewportWidth - panelWidth - 12));
  const panelTop = Math.max(12, (anchorRect?.bottom || 80) + 12);
  const shouldShowSearchSurface = isSearching || users.length > 0 || Boolean(query);

  return (
    <ViewportPortal>
      <motion.div
        className="fixed z-[10020] overflow-hidden border border-white/15 bg-black/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        style={{ left: panelLeft, top: panelTop, width: panelWidth }}
        {...SOFT_PANEL_REVEAL}
        transition={PAGE_TRANSITION}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-gray-500">new message</p>
            <h2 className="text-lg">start a conversation</h2>
          </div>

          <motion.button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
            aria-label="close new message"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            className="h-11 w-full border border-white/15 bg-transparent pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-white/40"
            placeholder="search artists by name or username"
            autoFocus
          />
        </div>

        <AnimatePresence initial={false}>
          {shouldShowSearchSurface ? (
            <motion.div
              layout
              className="archive-scrollbar-thin mt-3 max-h-[min(20rem,calc(100dvh-16rem))] overflow-x-hidden overflow-y-auto border border-white/10 bg-black/40 pr-1"
              {...MESSAGE_SURFACE_REVEAL}
              transition={MESSAGE_SURFACE_TRANSITION}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {isSearching ? (
                  <motion.div
                    key="searching"
                    layout
                    className="flex w-full min-w-0 items-center overflow-hidden border-b border-white/10 px-3 py-3 text-sm text-gray-500"
                    {...MESSAGE_ITEM_REVEAL}
                    transition={MESSAGE_SURFACE_TRANSITION}
                  >
                    <span className="min-w-0 truncate">searching...</span>
                  </motion.div>
                ) : null}

                {users.map((user, index) => (
                  <motion.button
                    key={user.userId}
                    layout
                    type="button"
                    onClick={() => {
                      onSelectUser?.(user);
                      onClose?.();
                    }}
                    className="flex w-full min-w-0 items-start gap-3 overflow-hidden border-b border-white/10 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.04]"
                    {...MESSAGE_ITEM_REVEAL}
                    transition={{
                      ...MESSAGE_SURFACE_TRANSITION,
                      delay: Math.min(index * 0.035, 0.16),
                    }}
                  >
                    <UserAvatar user={user} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm text-white">{user.displayName || user.username}</p>
                        <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.14em] text-gray-600">
                          {user.relationshipLabel}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">@{user.username}</p>
                      {user.bio ? <p className="mt-1 line-clamp-1 text-xs text-gray-600">{user.bio}</p> : null}
                    </div>
                  </motion.button>
                ))}

                {!isSearching && query && users.length === 0 ? (
                  <motion.div
                    key="empty-search"
                    layout
                    className="min-w-0 overflow-hidden px-3 py-4 text-sm text-gray-500"
                    {...MESSAGE_ITEM_REVEAL}
                    transition={MESSAGE_SURFACE_TRANSITION}
                  >
                    no matching artists.
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <div className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </motion.div>
    </ViewportPortal>
  );
}

export function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const newMessageButtonRef = useRef(null);
  const [hasInitialAccessToken] = useState(() =>
    typeof window === "undefined" ? true : Boolean(getStoredSupabaseAccessToken()),
  );
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(searchParams.get("conversationId") || "");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [hasCheckedConversations, setHasCheckedConversations] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const [newMessageAnchorRect, setNewMessageAnchorRect] = useState(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) || null;

  const getAccessToken = useCallback(async () => {
    return getStoredSupabaseAccessToken() || "";
  }, []);

  const markConversationRead = useCallback(
    async (conversationId, accessToken) => {
      if (!conversationId || !accessToken) {
        return;
      }

      await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "mark-read", conversationId }),
      }).catch(() => {});

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, isUnread: false } : conversation,
        ),
      );
    },
    [],
  );

  const loadMessages = useCallback(
    async ({ conversationId = activeConversationId, markRead = false } = {}) => {
      setError("");

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setConversations([]);
          setMessages([]);
          router.replace("/");
          return;
        }

        const isTemporaryConversation = String(conversationId || "").startsWith("temporary-");
        if (isTemporaryConversation) {
          setMessages([]);
          return;
        }

        const url = conversationId && !isTemporaryConversation
          ? `/api/messages?conversationId=${encodeURIComponent(conversationId)}`
          : "/api/messages";

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(payload?.error || "failed to load messages.");
          return;
        }

        const nextConversations = Array.isArray(payload?.conversations) ? payload.conversations : [];
        setHasCheckedConversations(true);
        setConversations((current) => {
          const temporaryConversation = current.find((conversation) => conversation.isTemporary);
          if (!temporaryConversation) {
            return nextConversations;
          }

          const stillMissing = !nextConversations.some(
            (conversation) =>
              conversation.participant?.userId === temporaryConversation.participant?.userId,
          );

          return stillMissing ? [temporaryConversation, ...nextConversations] : nextConversations;
        });

        if (Array.isArray(payload?.messages)) {
          setMessages(payload.messages);
        } else if (!conversationId) {
          setMessages([]);
        }

        if (markRead && conversationId) {
          await markConversationRead(conversationId, accessToken);
        }
      } catch {
        setError("failed to load messages.");
      }
    },
    [activeConversationId, getAccessToken, markConversationRead, router],
  );

  useEffect(() => {
    loadMessages({ conversationId: activeConversationId, markRead: Boolean(activeConversationId) });
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadMessages({ conversationId: activeConversationId, markRead: Boolean(activeConversationId) });
    });

    const intervalId = window.setInterval(() => {
      loadMessages({ conversationId: activeConversationId, markRead: false });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, [activeConversationId, loadMessages, supabase]);

  const openConversation = (conversationId) => {
    if (conversationId !== activeConversationId) {
      setMessages([]);
    }

    setActiveConversationId(conversationId);
    setDraft("");
    const conversation = conversations.find((entry) => entry.id === conversationId);
    router.replace(
      conversation?.isTemporary
        ? "/messages"
        : `/messages?conversationId=${encodeURIComponent(conversationId)}`,
      { scroll: false },
    );
  };

  const closeMobileThread = () => {
    setActiveConversationId("");
    setMessages([]);
    setDraft("");
    router.replace("/messages", { scroll: false });
  };

  const openParticipantProfile = (conversation) => {
    const username = conversation?.participant?.username;
    if (!username) {
      return;
    }

    // The conversation header doubles as a quiet profile shortcut, so users can
    // move from a message thread back to the artist page without hunting around.
    router.push(buildPublicProfilePath(username));
  };

  const openNewMessagePanel = () => {
    const rect = newMessageButtonRef.current?.getBoundingClientRect();
    setNewMessageAnchorRect(
      rect
        ? {
            left: rect.left,
            bottom: rect.bottom,
            width: rect.width,
          }
        : null,
    );
    setIsNewMessageOpen((current) => !current);
  };

  const selectTemporaryConversation = (user) => {
    if (!user?.userId) {
      return;
    }

    const existingConversation = conversations.find(
      (conversation) => conversation.participant?.userId === user.userId && !conversation.isTemporary,
    );

    if (existingConversation) {
      openConversation(existingConversation.id);
      return;
    }

    // Add a local-only draft row so choosing a recipient feels instant. The API
    // creates the real conversation only after the first message is sent.
    const temporaryId = `temporary-${user.userId}`;
    const temporaryConversation = {
      id: temporaryId,
      isTemporary: true,
      isUnread: false,
      updatedAt: new Date().toISOString(),
      updatedAtLabel: "draft",
      participant: {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      lastMessage: {
        id: `${temporaryId}-preview`,
        body: "new message",
        createdAt: new Date().toISOString(),
        isOwn: true,
      },
    };

    setConversations((current) => [
      temporaryConversation,
      ...current.filter(
        (conversation) =>
          !conversation.isTemporary && conversation.participant?.userId !== user.userId,
      ),
    ]);
    setMessages([]);
    setDraft("");
    setActiveConversationId(temporaryId);
    router.replace("/messages", { scroll: false });
  };

  const removeTemporaryConversation = (conversationId = activeConversationId) => {
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
    setMessages([]);
    setDraft("");

    if (activeConversationId === conversationId) {
      setActiveConversationId("");
      router.replace("/messages", { scroll: false });
    }
  };

  const deleteConversation = async () => {
    if (!conversationToDelete?.id || isDeletingConversation) {
      return;
    }

    if (conversationToDelete.isTemporary) {
      removeTemporaryConversation(conversationToDelete.id);
      setConversationToDelete(null);
      return;
    }

    setIsDeletingConversation(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("sign in to delete conversations.");
        return;
      }

      // Deletion is a participant-level hide, not a shared thread deletion.
      // The other user keeps their conversation exactly as it was.
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "delete-conversation",
          conversationId: conversationToDelete.id,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "failed to delete conversation.");
        return;
      }

      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []);
      setMessages([]);
      setHasCheckedConversations(true);

      if (activeConversationId === conversationToDelete.id) {
        setActiveConversationId("");
        setDraft("");
        router.replace("/messages", { scroll: false });
      }

      setConversationToDelete(null);
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const sendReply = async () => {
    const body = draft.trim();
    if (!activeConversationId || !body || isSending) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("sign in to send messages.");
        return;
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(
          activeConversation?.isTemporary
            ? {
                recipientUserId: activeConversation.participant?.userId,
                body,
              }
            : {
                conversationId: activeConversationId,
                body,
              },
        ),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "failed to send message.");
        return;
      }

      setDraft("");
      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []);
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);

      // Temporary conversations get swapped for the server-created id after the
      // first send, keeping the URL shareable once the thread actually exists.
      if (activeConversation?.isTemporary && payload?.conversationId) {
        setActiveConversationId(payload.conversationId);
        router.replace(`/messages?conversationId=${encodeURIComponent(payload.conversationId)}`, { scroll: false });
      }
    } finally {
      setIsSending(false);
    }
  };

  if (!hasInitialAccessToken) {
    return null;
  }

  return (
    <main className="mx-auto max-w-[94rem] px-4 py-8 md:px-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-gray-500">private inbox</p>
          <h1 className="text-3xl md:text-5xl">messages</h1>
        </div>
      </div>

      {error ? (
        <div className="mb-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid h-[calc(100dvh-10rem)] min-h-[40rem] max-h-[56rem] overflow-hidden border border-white/15 bg-black/40 lg:grid-cols-[25rem_1fr]">
        <section
          className={`relative min-h-0 flex-col border-white/10 lg:flex lg:border-r ${
            activeConversationId ? "hidden" : "flex"
          }`}
        >
          <div className="border-b border-white/10 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">conversations</p>
            <motion.button
              ref={newMessageButtonRef}
              type="button"
              onClick={openNewMessagePanel}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-white/25 px-4 py-2.5 text-sm text-white transition-colors hover:border-white/50 hover:bg-white/5"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <UserPlus className="h-4 w-4" />
              <span>new message</span>
            </motion.button>
          </div>

          <AnimatePresence>
            {isNewMessageOpen ? (
              <NewMessagePanel
                isOpen={isNewMessageOpen}
                onClose={() => setIsNewMessageOpen(false)}
                onSelectUser={selectTemporaryConversation}
                getAccessToken={getAccessToken}
                anchorRect={newMessageAnchorRect}
              />
            ) : null}
          </AnimatePresence>

          {conversations.length > 0 ? (
            <motion.div
              className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto"
              {...CONVERSATION_FADE_REVEAL}
              transition={MESSAGE_SURFACE_TRANSITION}
            >
              {conversations.map((conversation) => (
                <motion.div
                  key={conversation.id}
                  {...CONVERSATION_FADE_REVEAL}
                  transition={MESSAGE_SURFACE_TRANSITION}
                  className="overflow-hidden border-b border-white/10"
                >
                  <div
                    className={`grid w-full grid-cols-[minmax(0,1fr)_2.25rem] gap-3 px-4 py-4 transition-colors hover:bg-white/[0.04] ${
                      conversation.id === activeConversationId ? "bg-white/[0.06]" : ""
                    }`}
                  >
                    <motion.button
                      type="button"
                      onClick={() => openConversation(conversation.id)}
                      className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 text-left"
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <ConversationAvatar conversation={conversation} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{getParticipantName(conversation)}</p>
                        <p className={`mt-1 line-clamp-2 text-xs ${
                          conversation.isUnread ? "text-gray-300" : "text-gray-500"
                        }`}>
                          {conversation.lastMessage?.isOwn ? "you: " : ""}
                          {conversation.lastMessage?.body || "no messages yet."}
                        </p>
                        {conversation.participant?.username ? (
                          <p className="mt-2 truncate text-[11px] text-gray-600">@{conversation.participant.username}</p>
                        ) : null}
                      </div>
                    </motion.button>

                    <div className="flex min-h-full flex-col items-end justify-between gap-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center border border-white/10 text-gray-500 transition-colors hover:border-white/35 hover:text-white"
                            aria-label={`open conversation options for ${getParticipantName(conversation)}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[13.5rem] border-white/15 bg-black text-white"
                        >
                          <DropdownMenuItem
                            onSelect={() => setConversationToDelete(conversation)}
                            className="gap-2.5 whitespace-nowrap px-3 py-2 text-red-300 focus:bg-red-500/10 focus:text-red-200"
                          >
                            <Trash2 className="h-4 w-4 text-red-300" />
                            <span>delete conversation</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-gray-600">
                        {conversation.isTemporary ? "draft" : conversation.updatedAtLabel}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : hasCheckedConversations ? (
            <motion.div
              className="px-4 py-10 text-sm text-gray-500"
              {...CONVERSATION_FADE_REVEAL}
              transition={MESSAGE_SURFACE_TRANSITION}
            >
              no messages yet. start a conversation with the new message button.
            </motion.div>
          ) : null}
        </section>

        <section
          className={`min-h-0 flex-col ${
            activeConversationId ? "flex" : "hidden lg:flex"
          }`}
        >
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
                <button
                  type="button"
                  onClick={closeMobileThread}
                  className="flex h-9 w-9 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white lg:hidden"
                  aria-label="back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <motion.button
                  type="button"
                  onClick={() => openParticipantProfile(activeConversation)}
                  disabled={!activeConversation.participant?.username}
                  className="flex min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-85 disabled:cursor-default disabled:hover:opacity-100"
                  whileHover={activeConversation.participant?.username ? SOFT_BUTTON_HOVER : undefined}
                  whileTap={activeConversation.participant?.username ? SOFT_BUTTON_TAP : undefined}
                  aria-label={`open ${getParticipantName(activeConversation)} profile`}
                >
                  <ConversationAvatar conversation={activeConversation} size="h-11 w-11" />
                  <div className="min-w-0">
                    <p className="truncate text-base text-white">{getParticipantName(activeConversation)}</p>
                    {activeConversation.participant?.username ? (
                      <p className="truncate text-xs text-gray-500">@{activeConversation.participant.username}</p>
                    ) : null}
                  </div>
                </motion.button>
                {activeConversation.isTemporary ? (
                  <button
                    type="button"
                    onClick={() => removeTemporaryConversation(activeConversation.id)}
                    className="ml-auto flex h-9 w-9 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
                    aria-label="cancel new message"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-slot=scroll-area-scrollbar]]:w-2 [&_[data-slot=scroll-area-thumb]]:bg-white/15 [&_[data-slot=scroll-area-thumb]]:transition-colors hover:[&_[data-slot=scroll-area-thumb]]:bg-white/25">
                <div className="flex min-h-full flex-col gap-2.5 px-4 py-5 md:px-7">
                  {messages.length > 0 ? (
                    <motion.div
                      key="thread-messages"
                      className="flex flex-col gap-2.5"
                      {...THREAD_FADE_REVEAL}
                      transition={MESSAGE_SURFACE_TRANSITION}
                    >
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          conversation={activeConversation}
                        />
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </ScrollArea>

              <motion.div
                key={`composer-${activeConversation.id}`}
                className="border-t border-white/10 p-4 md:p-5"
                {...COMPOSER_FADE_REVEAL}
                transition={MESSAGE_SURFACE_TRANSITION}
              >
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                  className="archive-scrollbar-thin min-h-24 w-full resize-none overflow-y-auto rounded-none border border-white/15 bg-transparent px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus-visible:border-white/40 focus-visible:ring-0"
                  placeholder="write message..."
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-gray-600">{draft.length}/{MAX_MESSAGE_LENGTH}</p>
                  <motion.button
                    type="button"
                    onClick={sendReply}
                    disabled={!draft.trim() || isSending}
                    className="inline-flex items-center gap-2 border border-white/25 px-4 py-2.5 text-sm text-white transition-colors hover:border-white/50 hover:bg-white/5 disabled:opacity-50"
                    whileHover={SOFT_BUTTON_HOVER}
                    whileTap={SOFT_BUTTON_TAP}
                  >
                    <Send className="h-4 w-4" />
                    <span>{isSending ? "sending..." : "send"}</span>
                  </motion.button>
                </div>
              </motion.div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <MessageSquare className="mx-auto mb-4 h-10 w-10 text-gray-600" />
                <p className="text-lg text-white">select a conversation</p>
                <p className="mt-2 max-w-sm text-sm text-gray-500">
                  your messages will appear here when you choose a thread.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <AlertDialog
        open={Boolean(conversationToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingConversation) {
            setConversationToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-none border-white/15 bg-black text-white shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-normal">delete conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-gray-400">
              this only removes the conversation from your inbox. it will not delete the conversation for the other user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletingConversation}
              className="rounded-none border-white/20 bg-transparent text-gray-300 hover:border-white/40 hover:bg-white/5 hover:text-white"
            >
              cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingConversation}
              onClick={(event) => {
                event.preventDefault();
                deleteConversation();
              }}
              className="rounded-none border border-red-400/45 bg-red-500/10 text-red-200 hover:bg-red-500/15"
            >
              {isDeletingConversation ? "deleting..." : "delete conversation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
