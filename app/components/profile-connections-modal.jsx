"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { ViewportPortal } from "./viewport-portal";
import { buildPublicProfilePath } from "@/lib/media-slugs";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_PANEL_REVEAL } from "@/lib/motion";

function getAvatarFallback(connection) {
  const label = connection?.displayName || connection?.username || "?";
  return label.charAt(0).toUpperCase();
}

export function ProfileConnectionsModal({
  username,
  displayName,
  initialView = "followers",
  onClose,
}) {
  const [activeView, setActiveView] = useState(initialView);
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const title = useMemo(
    () => (activeView === "followers" ? "followers" : "following"),
    [activeView],
  );

  useEffect(() => {
    let mounted = true;

    async function loadConnections() {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await fetch(
          `/api/profile/connections?username=${encodeURIComponent(username)}&type=${encodeURIComponent(activeView)}`,
        );

        const payload = await response.json().catch(() => ({}));
        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setConnections([]);
          setLoadError(payload?.error || `Failed to load ${activeView}.`);
          setIsLoading(false);
          return;
        }

        setConnections(Array.isArray(payload?.connections) ? payload.connections : []);
        setIsLoading(false);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setConnections([]);
        setLoadError(error instanceof Error ? error.message : `Failed to load ${activeView}.`);
        setIsLoading(false);
      }
    }

    loadConnections();
    return () => {
      mounted = false;
    };
  }, [activeView, username]);

  return (
    <ViewportPortal>
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-2xl border border-white/20 bg-black"
        {...SOFT_PANEL_REVEAL}
        transition={PAGE_TRANSITION}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-6">
          <div>
            <p className="cursor-default select-none text-[11px] uppercase tracking-[0.22em] text-gray-500">
              @{username}
            </p>
            <h2 className="mt-1 cursor-default select-none text-xl text-white">
              {displayName || username}
            </h2>
          </div>

          <motion.button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-400 transition-colors hover:border-white/40 hover:text-white"
            aria-label="Close connections list"
            whileHover={SOFT_BUTTON_HOVER}
            whileTap={SOFT_BUTTON_TAP}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <div className="flex border-b border-white/10">
          {["followers", "following"].map((view) => (
            <motion.button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`flex-1 border-r border-white/10 px-4 py-3 text-sm uppercase tracking-[0.18em] transition-colors last:border-r-0 ${
                activeView === view
                  ? "bg-white text-black"
                  : "bg-transparent text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
              whileHover={activeView === view ? undefined : SOFT_BUTTON_HOVER}
              whileTap={SOFT_BUTTON_TAP}
              transition={PAGE_TRANSITION}
            >
              {view}
            </motion.button>
          ))}
        </div>

        <div className="scrollbar-hidden max-h-[65vh] overflow-x-hidden overflow-y-auto">
          {isLoading ? (
            <div className="px-5 py-8 text-sm text-gray-400 md:px-6">loading {title}...</div>
          ) : loadError ? (
            <div className="px-5 py-8 text-sm text-red-400 md:px-6">{loadError}</div>
          ) : connections.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 md:px-6">no {title} yet.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {connections.map((connection) => (
                <motion.div
                  key={`${activeView}-${connection.userId}`}
                  whileHover={SOFT_BUTTON_HOVER}
                  transition={PAGE_TRANSITION}
                >
                  <Link
                    href={buildPublicProfilePath(connection.username)}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/5 md:px-6"
                    onClick={onClose}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/5">
                      {connection.avatarUrl ? (
                        <img
                          src={connection.avatarUrl}
                          alt={connection.displayName || connection.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-gray-400">{getAvatarFallback(connection)}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="cursor-pointer text-white transition-colors hover:text-gray-300">
                        {connection.displayName || connection.username}
                      </p>
                      <p className="mt-1 cursor-default select-none text-sm text-gray-500">
                        @{connection.username}
                      </p>
                      {connection.bio ? (
                        <p className="mt-2 line-clamp-2 cursor-default select-none text-sm leading-relaxed text-gray-400">
                          {connection.bio}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
    </ViewportPortal>
  );
}
