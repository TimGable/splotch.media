"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Heart, MessageCircle, Megaphone, Send, Trash2 } from "lucide-react";
import { ArchiveLoadingState } from "./archive-loading-state";
import { MentionText } from "./mention-text";
import { MentionTextarea } from "./mention-textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function CommunityAnnouncementsBoard({ onBack }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [posts, setPosts] = useState([]);
  const [canPost, setCanPost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [submittingPostId, setSubmittingPostId] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});

  const getAuthHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  };

  const loadBoard = async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const response = await fetch("/api/announcements", { headers });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload?.error || "Failed to load community announcements.");
      setLoading(false);
      return;
    }

    setPosts(Array.isArray(payload?.posts) ? payload.posts : []);
    setCanPost(Boolean(payload?.canPost));
    setLoading(false);
  };

  useEffect(() => {
    loadBoard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadBoard();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const replacePost = (nextPost) => {
    setPosts((current) =>
      current.map((entry) => (entry.id === nextPost.id ? nextPost : entry)),
    );
  };

  const handlePublish = async (event) => {
    event.preventDefault();
    setPosting(true);
    setError("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ body: draftBody }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Failed to publish announcement.");
        return;
      }

      setPosts(Array.isArray(payload?.posts) ? payload.posts : []);
      setCanPost(Boolean(payload?.canPost));
      setDraftBody("");
    } finally {
      setPosting(false);
    }
  };

  const handlePostAction = async (postId, requestInit, { clearDraft = false } = {}) => {
    setSubmittingPostId(postId);
    setError("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/announcements/${postId}/social${requestInit?.suffix || ""}`, {
        method: requestInit.method || "POST",
        headers: {
          ...(requestInit.method !== "DELETE" ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: requestInit.body ? JSON.stringify(requestInit.body) : undefined,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Failed to update announcement.");
        return;
      }

      if (payload?.success && payload?.postId) {
        setPosts((current) => current.filter((entry) => entry.id !== payload.postId));
        return;
      }

      replacePost(payload);
      if (clearDraft) {
        setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      }
    } finally {
      setSubmittingPostId("");
    }
  };

  if (loading) {
    return <ArchiveLoadingState className="max-w-5xl" />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
        back
      </button>

      <div className="mb-10">
        <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-gray-500">community</p>
        <h2 className="text-3xl md:text-4xl">announcements</h2>
      </div>

      {canPost ? (
        <motion.form
          onSubmit={handlePublish}
          className="mb-8 border border-white/20 bg-black/35 p-6 md:p-8"
          {...SOFT_PANEL_REVEAL}
          transition={PAGE_TRANSITION}
        >
          <div className="mb-4 flex items-center gap-3 text-sm text-gray-300">
            <Megaphone className="h-4 w-4 text-gray-400" />
            <span>moderation update</span>
          </div>
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            rows={4}
            maxLength={3000}
            placeholder="share an update with the community..."
            className="archive-scrollbar-thin w-full resize-none overflow-y-auto border border-white/20 bg-transparent px-4 py-3 text-sm text-white transition-colors focus:border-white/50 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">{draftBody.length}/3000</p>
            <motion.button
              type="submit"
              disabled={posting || !draftBody.trim()}
              className="inline-flex items-center gap-2 border border-white/40 px-4 py-2.5 text-sm transition-colors hover:border-white/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              whileHover={SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <Send className="h-4 w-4" />
              <span>{posting ? "posting..." : "post update"}</span>
            </motion.button>
          </div>
        </motion.form>
      ) : null}

      {error ? (
        <div className="mb-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="border border-white/10 bg-white/[0.03] px-6 py-10 text-sm text-gray-400">
            no announcements yet.
          </div>
        ) : (
          posts.map((post) => (
            <motion.div
              key={post.id}
              className="border border-white/20 bg-black/35 p-6 md:p-8"
              {...SOFT_PANEL_REVEAL}
              transition={PAGE_TRANSITION}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04]">
                    {post.author?.avatarUrl ? (
                      <img src={post.author.avatarUrl} alt={post.author?.displayName || "avatar"} className="h-full w-full object-cover" />
                    ) : (
                      <Megaphone className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {post.author?.displayName || post.author?.username || "moderation"}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">
                      {formatRelativeTime(post.createdAt)}
                    </p>
                  </div>
                </div>

                {post.canDelete ? (
                  <button
                    type="button"
                    onClick={() => handlePostAction(post.id, { method: "DELETE" })}
                    disabled={submittingPostId === post.id}
                    className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-red-300 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    delete
                  </button>
                ) : null}
              </div>

              <div className="whitespace-pre-wrap text-sm leading-7 text-gray-200">
                <MentionText text={post.body} />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-white/10 pb-5">
                <motion.button
                  type="button"
                  onClick={() => handlePostAction(post.id, { body: { action: "toggle-like" } })}
                  disabled={submittingPostId === post.id}
                  className={`inline-flex items-center gap-2 border px-4 py-2.5 text-sm transition-colors ${
                    post.isLiked
                      ? "border-white bg-white text-black hover:bg-white/90"
                      : "border-white/20 bg-white/[0.03] text-gray-300 hover:border-white/50 hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <Heart className={`h-4 w-4 ${post.isLiked ? "fill-black text-black" : ""}`} />
                  <span>{post.likeCount}</span>
                </motion.button>

                <div className="inline-flex items-center gap-2 border border-white/20 bg-white/[0.03] px-4 py-2.5 text-sm text-gray-300">
                  <MessageCircle className="h-4 w-4" />
                  <span>{post.commentCount}</span>
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-gray-500">replies</p>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    handlePostAction(
                      post.id,
                      {
                        body: {
                          action: "comment",
                          body: commentDrafts[post.id] || "",
                        },
                      },
                      { clearDraft: true },
                    );
                  }}
                  className="mb-6"
                >
                  <MentionTextarea
                    value={commentDrafts[post.id] || ""}
                    onValueChange={(nextValue) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: nextValue,
                      }))
                    }
                    rows={3}
                    maxLength={1000}
                    placeholder="leave a reply..."
                    textareaClassName="archive-scrollbar-thin w-full resize-none overflow-y-auto border border-white/20 bg-transparent px-4 py-3 text-sm text-white transition-colors focus:border-white/50 focus:outline-none"
                  />
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="text-xs text-gray-500">{(commentDrafts[post.id] || "").length}/1000</p>
                    <motion.button
                      type="submit"
                      disabled={submittingPostId === post.id || !(commentDrafts[post.id] || "").trim()}
                      className="border border-white/40 px-4 py-2.5 text-sm transition-colors hover:border-white/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      post reply
                    </motion.button>
                  </div>
                </form>

                {post.comments.length === 0 ? (
                  <div className="border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-gray-400">
                    no replies yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {post.comments.map((comment) => (
                      <motion.div
                        key={comment.id}
                        className="border border-white/10 bg-white/[0.03] p-4"
                        {...SOFT_PANEL_REVEAL}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.05]">
                              {comment.author?.avatarUrl ? (
                                <img src={comment.author.avatarUrl} alt={comment.author?.displayName || "avatar"} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs uppercase text-gray-400">
                                  {(comment.author?.displayName || comment.author?.username || "?").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white">
                                {comment.author?.displayName || comment.author?.username || "community member"}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                                {formatRelativeTime(comment.createdAt)}
                              </p>
                            </div>
                          </div>

                          {comment.canDelete ? (
                            <button
                              type="button"
                              onClick={() =>
                                handlePostAction(post.id, {
                                  method: "DELETE",
                                  suffix: `?commentId=${encodeURIComponent(comment.id)}`,
                                })
                              }
                              disabled={submittingPostId === post.id}
                              className="text-gray-500 transition-colors hover:text-red-300 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-gray-200">
                          <MentionText text={comment.body} />
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
