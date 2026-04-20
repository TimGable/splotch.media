"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { MentionText } from "./mention-text";
import { MentionTextarea } from "./mention-textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildPublicProfilePath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

export function MediaSocialPanel({
  mediaItemId,
  initialLikeCount = 0,
  initialCommentCount = 0,
  initialIsLiked = false,
  onUpdate,
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [social, setSocial] = useState({
    likeCount: Number(initialLikeCount || 0),
    commentCount: Number(initialCommentCount || 0),
    isLiked: Boolean(initialIsLiked),
    comments: [],
  });
  const [commentBody, setCommentBody] = useState("");
  const [socialError, setSocialError] = useState("");
  const [isLoadingSocial, setIsLoadingSocial] = useState(true);
  const [isSubmittingLike, setIsSubmittingLike] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [removingCommentId, setRemovingCommentId] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);

  useEffect(() => {
    setSocial({
      likeCount: Number(initialLikeCount || 0),
      commentCount: Number(initialCommentCount || 0),
      isLiked: Boolean(initialIsLiked),
      comments: [],
    });
    setCommentBody("");
    setSocialError("");
  }, [mediaItemId, initialLikeCount, initialCommentCount, initialIsLiked]);

  const applySocialPayload = (payload) => {
    const nextSocial = {
      likeCount: Number(payload?.likeCount || 0),
      commentCount: Number(payload?.commentCount || 0),
      isLiked: Boolean(payload?.isLiked),
      comments: Array.isArray(payload?.comments) ? payload.comments : [],
    };

    setSocial(nextSocial);
    setReplyingTo(null);
    onUpdate?.({
      likes: nextSocial.likeCount,
      comments: nextSocial.commentCount,
      isLiked: nextSocial.isLiked,
    });
  };

  useEffect(() => {
    let mounted = true;

    async function loadSocial() {
      setIsLoadingSocial(true);
      setSocialError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers = session?.access_token
        ? {
            Authorization: `Bearer ${session.access_token}`,
          }
        : undefined;

      const response = await fetch(`/api/media/${mediaItemId}/social`, { headers });
      const payload = await response.json().catch(() => ({}));

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setSocialError(payload?.error || "Failed to load likes and comments.");
        setIsLoadingSocial(false);
        return;
      }

      applySocialPayload(payload);
      setIsLoadingSocial(false);
    }

    loadSocial();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSocial();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [mediaItemId, supabase]);

  const commentsById = useMemo(() => {
    const map = new Map();
    for (const comment of social.comments) {
      map.set(comment.id, comment);
    }
    return map;
  }, [social.comments]);

  const commentDepths = useMemo(() => {
    const map = new Map();
    for (const comment of social.comments) {
      let depth = 0;
      let parentId = comment.parentCommentId;
      const seen = new Set([comment.id]);
      while (parentId && depth < 4 && !seen.has(parentId)) {
        depth += 1;
        seen.add(parentId);
        const parent = commentsById.get(parentId);
        parentId = parent?.parentCommentId;
      }
      map.set(comment.id, depth);
    }
    return map;
  }, [commentsById, social.comments]);

  const handleToggleLike = async () => {
    setIsSubmittingLike(true);
    setSocialError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSocialError("Sign in to like posts.");
        return;
      }

      const response = await fetch(`/api/media/${mediaItemId}/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "toggle-like" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSocialError(payload?.error || "Failed to update like.");
        return;
      }

      applySocialPayload(payload);
    } finally {
      setIsSubmittingLike(false);
    }
  };

  const handleSubmitComment = async (event) => {
    event.preventDefault();
    setIsSubmittingComment(true);
    setSocialError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSocialError("Sign in to leave a comment.");
        return;
      }

      const response = await fetch(`/api/media/${mediaItemId}/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "comment",
          body: commentBody,
          parentCommentId: replyingTo?.id || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSocialError(payload?.error || "Failed to post comment.");
        return;
      }

      applySocialPayload(payload);
      setCommentBody("");
      setReplyingTo(null);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    setRemovingCommentId(commentId);
    setSocialError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSocialError("Sign in to manage comments.");
        return;
      }

      const response = await fetch(
        `/api/media/${mediaItemId}/social?commentId=${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSocialError(payload?.error || "Failed to remove comment.");
        return;
      }

      applySocialPayload(payload);
      if (replyingTo?.id === commentId) {
        setReplyingTo(null);
      }
    } finally {
      setRemovingCommentId("");
    }
  };

  const handleStartReply = (comment) => {
    if (!comment || comment.isDeleted) {
      return;
    }

    setReplyingTo(comment);
    if (!commentBody.trim() && comment.author?.username) {
      setCommentBody(`@${comment.author.username} `);
    }
  };

  return (
    <div className="border border-white/20 bg-black/35 p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-white/10 pb-5">
        <motion.button
          type="button"
          onClick={handleToggleLike}
          disabled={isSubmittingLike}
          className={`inline-flex items-center gap-2 border px-4 py-2.5 text-sm transition-colors ${
            social.isLiked
              ? "border-white bg-white text-black hover:bg-white/90"
              : "border-white/20 bg-white/[0.03] text-gray-300 hover:border-white/50 hover:text-white"
          } disabled:cursor-not-allowed disabled:opacity-60`}
          whileHover={SOFT_BUTTON_HOVER}
          whileTap={SOFT_BUTTON_TAP}
          transition={PAGE_TRANSITION}
        >
          <Heart className={`h-4 w-4 ${social.isLiked ? "fill-black text-black" : ""}`} />
          <span>{social.likeCount}</span>
        </motion.button>

        <motion.div
          className="inline-flex items-center gap-2 border border-white/20 bg-white/[0.03] px-4 py-2.5 text-sm text-gray-300"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 1 }}
          transition={PAGE_TRANSITION}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{social.commentCount}</span>
        </motion.div>
      </div>

      <div>
        <div>
          <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-gray-500">comments</p>

          <form onSubmit={handleSubmitComment} className="mb-6">
            {replyingTo ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded border border-white/15 px-3 py-2 text-xs text-gray-400">
                <span>
                  Replying to {replyingTo.author?.displayName || replyingTo.author?.username || "user"}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-[11px] uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-white"
                >
                  cancel
                </button>
              </div>
            ) : null}
            <MentionTextarea
              value={commentBody}
              onValueChange={setCommentBody}
                rows={4}
                maxLength={1000}
                placeholder="leave a comment..."
                textareaClassName="w-full resize-none border border-white/20 bg-transparent px-4 py-3 text-sm text-white transition-colors focus:border-white/50 focus:outline-none"
              />

            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500">{commentBody.length}/1000</p>

              <motion.button
                type="submit"
                disabled={isSubmittingComment || !commentBody.trim()}
                className="border border-white/40 px-4 py-2.5 text-sm transition-colors hover:border-white/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
                transition={PAGE_TRANSITION}
              >
                {isSubmittingComment ? "posting..." : "post comment"}
              </motion.button>
            </div>
          </form>

          {socialError ? (
            <div className="mb-4 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {socialError}
            </div>
          ) : null}

          {isLoadingSocial ? (
            <div className="border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-400">
              loading comments...
            </div>
          ) : social.comments.length === 0 ? (
            <div className="border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-400">
              no comments yet.
            </div>
          ) : (
            <div className="space-y-4">
              {social.comments.map((comment) => {
                const depth = commentDepths.get(comment.id) || 0;
                const indentPx = Math.min(depth, 4) * 20;
                const authorUsername = comment.author?.username || "";
                const authorLabel =
                  comment.author?.displayName || comment.author?.username || "archive user";
                const authorPath = authorUsername ? buildPublicProfilePath(authorUsername) : "";
                const avatarNode = (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.05]">
                    {comment.author?.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={authorLabel}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs uppercase text-gray-400">
                        {authorLabel.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                );
                return (
                <motion.div
                  key={comment.id}
                  className="border border-white/10 bg-white/[0.03] p-4"
                  {...SOFT_PANEL_REVEAL}
                  transition={PAGE_TRANSITION}
                  style={{ marginLeft: indentPx }}
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {authorPath ? (
                        <Link
                          href={authorPath}
                          aria-label={`Open ${authorLabel}'s profile`}
                          className="flex-shrink-0 rounded-full transition-opacity hover:opacity-80"
                        >
                          {avatarNode}
                        </Link>
                      ) : (
                        avatarNode
                      )}

                      <div className="min-w-0">
                        {authorPath ? (
                          <Link
                            href={authorPath}
                            className="block truncate text-sm text-white transition-colors hover:text-gray-300"
                          >
                            {authorLabel}
                          </Link>
                        ) : (
                          <p className="truncate text-sm text-white">{authorLabel}</p>
                        )}
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </p>
                        {comment.parentCommentId ? (
                          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                            replying to{" "}
                            {(() => {
                              const parent = commentsById.get(comment.parentCommentId);
                              return parent?.author?.displayName || parent?.author?.username || "comment";
                            })()}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {comment.canDelete ? (
                      <motion.button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={removingCommentId === comment.id}
                        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-gray-500 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                        transition={PAGE_TRANSITION}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{removingCommentId === comment.id ? "removing..." : "remove"}</span>
                      </motion.button>
                    ) : !comment.isDeleted ? (
                      <motion.button
                        type="button"
                        onClick={() => handleStartReply(comment)}
                        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-gray-500 transition-colors hover:text-white"
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                        transition={PAGE_TRANSITION}
                      >
                        reply
                      </motion.button>
                    ) : null}
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                    {comment.isDeleted ? "comment removed" : <MentionText text={comment.body} />}
                  </p>
                </motion.div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
