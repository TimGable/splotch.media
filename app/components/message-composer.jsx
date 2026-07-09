"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { MessageSquare, Send, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP } from "@/lib/motion";
import { ViewportPortal } from "./viewport-portal";

const MAX_MESSAGE_LENGTH = 2000;

export function MessageComposer({ isOpen, recipient, onClose, onSent }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSending, setIsSending] = useState(false);

  if (!isOpen || !recipient?.userId) {
    return null;
  }

  const sendMessage = async () => {
    const messageBody = body.trim();
    if (!messageBody || isSending) {
      return;
    }

    setIsSending(true);
    setStatus({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setStatus({ type: "error", message: "sign in to send messages." });
        return;
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipientUserId: recipient.userId,
          body: messageBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ type: "error", message: payload?.error || "failed to send message." });
        return;
      }

      setBody("");
      setStatus({ type: "success", message: "message sent." });
      onSent?.(payload);
      window.setTimeout(() => {
        onClose?.();
        setStatus({ type: "", message: "" });
      }, 700);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ViewportPortal>
      <motion.div
        className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={onClose}
      >
        <motion.div
          className="w-full max-w-lg border border-white/20 bg-black p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] md:p-6"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={PAGE_TRANSITION}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-gray-500">message</p>
              <h2 className="text-2xl">{recipient.displayName || recipient.username}</h2>
              <p className="mt-1 text-sm text-gray-500">@{recipient.username}</p>
            </div>

            <motion.button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
              aria-label="close message composer"
            >
              <X className="h-4 w-4" />
            </motion.button>
          </div>

          <div className="mb-4 flex items-center gap-3 border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              {recipient.avatarUrl ? (
                <img
                  src={recipient.avatarUrl}
                  alt={recipient.displayName || recipient.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <MessageSquare className="h-4 w-4 text-gray-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{recipient.displayName || recipient.username}</p>
              <p className="truncate text-xs text-gray-500">private user-to-user message</p>
            </div>
          </div>

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            className="min-h-36 w-full resize-none border border-white/15 bg-transparent px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-white/40"
            placeholder="write message..."
          />

          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-600">{body.length}/{MAX_MESSAGE_LENGTH}</p>
            <motion.button
              type="button"
              onClick={sendMessage}
              disabled={!body.trim() || isSending}
              className="inline-flex items-center gap-2 border border-white/30 px-4 py-2.5 text-sm text-white transition-colors hover:border-white/50 hover:bg-white/5 disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <Send className="h-4 w-4" />
              <span>{isSending ? "sending..." : "send"}</span>
            </motion.button>
          </div>

          {status.message ? (
            <div
              className={`mt-4 border px-3 py-2 text-sm ${
                status.type === "error"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-green-500/40 bg-green-500/10 text-green-300"
              }`}
            >
              {status.message}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </ViewportPortal>
  );
}
