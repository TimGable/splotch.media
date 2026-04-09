import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ImageWithFallback } from "./figma/ImageWithFallback.tsx";
import {
  PAGE_TRANSITION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
  SOFT_CARD_HOVER,
} from "@/lib/motion";

const COPY_BY_CATEGORY = {
  music: {
    title: "music artists",
    countLabel: "artists sharing their work",
    emptyTitle: "no music artists available yet",
    emptyDescription: "artists will appear here once they publish public releases",
  },
  visual: {
    title: "visual artists",
    countLabel: "artists sharing their work",
    emptyTitle: "no visual artists available yet",
    emptyDescription: "artists will appear here once they publish public artwork",
  },
  video: {
    title: "video artists",
    countLabel: "artists sharing their work",
    emptyTitle: "no video artists available yet",
    emptyDescription: "artists will appear here once they publish public videos",
  },
};

export function BrowseCategoryArtists({ category, onArtistClick, onBack }) {
  const [artists, setArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const copy = COPY_BY_CATEGORY[category] || COPY_BY_CATEGORY.music;

  useEffect(() => {
    let mounted = true;

    async function loadArtists() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/discover/artists?category=${encodeURIComponent(category)}`);
        const payload = await response.json().catch(() => ({}));

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setError(payload?.error || "Failed to load artists.");
          setArtists([]);
          return;
        }

        setArtists(payload?.artists || []);
      } catch (nextError) {
        if (!mounted) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Failed to load artists.");
        setArtists([]);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadArtists();
    return () => {
      mounted = false;
    };
  }, [category]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={PAGE_TRANSITION}
    >
      <motion.button
        onClick={onBack}
        className="mb-6 md:mb-8 text-gray-400 hover:text-white transition-colors relative group inline-block touch-manipulation"
        whileHover={{ x: -3, ...SOFT_BUTTON_HOVER }}
        whileTap={SOFT_BUTTON_TAP}
      >
        <span className="inline-block" aria-hidden="true">{"\u2190"}</span>
        <span className="ml-2">back</span>
        <motion.div
          className="absolute -bottom-1 left-0 h-px bg-white"
          initial={{ width: 0 }}
          whileHover={{ width: "100%" }}
          transition={PAGE_TRANSITION}
        />
      </motion.button>

      <div className="border border-white/20 p-6 md:p-12 mb-12">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl md:text-4xl mb-2">{copy.title}</h2>
            <p className="text-gray-400 text-sm md:text-base">
              {artists.length} {copy.countLabel}
            </p>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-gray-500">
            Browse active profiles and open their public archive pages.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-6 border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-400">
          loading artists...
        </div>
      )}

      {!isLoading && !error && artists.length === 0 && (
        <motion.div
          className="border border-white/20 border-dashed p-12 md:p-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...PAGE_TRANSITION, delay: 0.12 }}
        >
          <p className="text-gray-400 text-base md:text-lg mb-2">{copy.emptyTitle}</p>
          <p className="text-gray-500 text-sm">{copy.emptyDescription}</p>
        </motion.div>
      )}

      {!isLoading && artists.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {artists.map((artist, index) => (
            <motion.button
              key={artist.id}
              type="button"
              onClick={() => onArtistClick(artist)}
              className="border border-white/20 bg-white/5 p-5 text-left transition-colors hover:border-white/40 hover:bg-white/[0.08]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...PAGE_TRANSITION, delay: 0.05 * index }}
              whileHover={SOFT_CARD_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <div className="mb-4 aspect-[4/3] overflow-hidden border border-white/10 bg-black">
                <ImageWithFallback
                  src={artist.featuredImage || artist.avatar}
                  alt={`${artist.name}'s featured work`}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="mb-4 flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-white/20 bg-white/5">
                  <ImageWithFallback
                    src={artist.avatar}
                    alt={artist.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg">{artist.name}</h3>
                  <p className="truncate text-sm text-gray-400">@{artist.username}</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span>{artist.releaseCount} uploads</span>
                <span>{artist.followerCount || 0} followers</span>
                <span>{artist.followingCount || 0} following</span>
              </div>

              <p className="line-clamp-3 text-sm leading-relaxed text-gray-400">
                {artist.bio || "No bio added yet."}
              </p>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
