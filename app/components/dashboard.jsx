import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { BrowseArtists } from "./browse-artists";
import { MyProfile } from "./my-profile";
import { BrowseVisualArtists } from "./browse-visual-artists";
import { BrowseVideoArtists } from "./browse-video-artists";
import { CategorySelector } from "./category-selector";
import { Feed } from "./feed";
import { InteractiveBackground } from "./interactive-background";
import { AdminPanel } from "./admin-panel";
import { CommunityAnnouncementsBoard } from "./community-announcements-board";
import { GlobalUploadFlow } from "./global-upload-flow";
import { usePublicAudio } from "./public-audio-context";
import { SiteNavigation } from "./site-navigation";
import { ViewportPortal } from "./viewport-portal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildPublicMediaPath, buildPublicProfilePath } from "@/lib/media-slugs";
import {
  consumeInitialRootView,
  getRootViewHistorySeed,
  rememberRootViewReturn,
} from "@/lib/public-navigation";
import {
  FADE_UP_ANIMATION,
  PAGE_TRANSITION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
} from "@/lib/motion";

function isGeneratedUsername(username) {
  return typeof username === "string" && /_[a-f0-9]{8}$/.test(username);
}

function isMultiTrackReleaseItem(item) {
  return item?.mediaKind === "music" && item?.collectionId && item?.releaseType !== "single";
}

function getReleaseTitle(item) {
  return isMultiTrackReleaseItem(item) ? item.collectionTitle || item.title : item.title;
}

function createProfileQueueEntry(item, artist) {
  return {
    track: {
      id: item.id,
      title: item.title,
      audioUrl: item.asset.url,
      slug: item.slug || "",
    },
    release: {
      id: item.collectionId || item.id,
      title: getReleaseTitle(item),
      coverArt: item.coverAsset?.url || "",
    },
    artist: {
      name: artist?.name || "artist",
      username: artist?.username || "",
    },
  };
}

function createFeedQueueEntry(item) {
  return {
    track: {
      id: item.id,
      title: item.title,
      audioUrl: item.asset?.url || "",
      slug: item.slug || "",
    },
    release: {
      id: item.collectionId || item.id,
      title: getReleaseTitle(item),
      coverArt: item.coverAsset?.url || "",
    },
    artist: {
      name: item.artist?.displayName || item.artist?.username || "artist",
      username: item.artist?.username || "",
    },
  };
}

export function Dashboard({ onSignOut }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [currentView, setCurrentView] = useState('home');
  const viewHistoryRef = useRef([]);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [forceProfileSetup, setForceProfileSetup] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileCategoryTags, setProfileCategoryTags] = useState([]);
  const [profileNavigationIntent, setProfileNavigationIntent] = useState("");
  const [showGlobalUploadFlow, setShowGlobalUploadFlow] = useState(false);
  const {
    currentTrack,
    playbackQueue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    setCurrentTrack,
    setPlaybackQueue,
    setQueueIndex,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    seekTrack,
    skipTrack,
  } = usePublicAudio();

  const openPublicProfile = (artist, returnView) => {
    if (typeof window === "undefined" || !artist?.username) {
      return;
    }

    if (returnView) {
      rememberRootViewReturn(returnView);
    }

    router.push(buildPublicProfilePath(artist.username));
  };

  const openPublicMediaItem = (item, returnView) => {
    if (typeof window === "undefined" || !item?.artist?.username || !item?.slug) {
      return;
    }

    if (returnView) {
      rememberRootViewReturn(returnView);
    }

    router.push(buildPublicMediaPath(item.artist.username, item.slug));
  };

  const navigateToView = (nextView, { recordHistory = true } = {}) => {
    setCurrentView((current) => {
      if (current === nextView) {
        return current;
      }

      if (recordHistory) {
        const currentHistory = viewHistoryRef.current;
        if (currentHistory[currentHistory.length - 1] !== current) {
          viewHistoryRef.current = [...currentHistory, current];
        }
      }

      return nextView;
    });
  };

  const goBackView = (fallbackView = "home") => {
    setCurrentView((current) => {
      const currentHistory = viewHistoryRef.current;
      const previousView = currentHistory[currentHistory.length - 1];

      if (!previousView) {
        return fallbackView;
      }

      viewHistoryRef.current = currentHistory.slice(0, -1);
      return previousView === current ? fallbackView : previousView;
    });
  };

  useEffect(() => {
    const initialView = consumeInitialRootView();
    if (!initialView) {
      return;
    }

    viewHistoryRef.current = getRootViewHistorySeed(initialView);
    navigateToView(initialView, { recordHistory: false });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) return;

      const payload = await response.json();
      if (!mounted) return;

      setIsAdmin(Boolean(payload?.profile?.isAdmin));
      setIsModerator(Boolean(payload?.profile?.isModerator));
      setProfileUsername(payload?.profile?.username || "");
      setProfileAvatarUrl(payload?.profile?.avatarUrl || "");
      setProfileDisplayName(payload?.profile?.displayName || "");
      setProfileCategoryTags(Array.isArray(payload?.profile?.categoryTags) ? payload.profile.categoryTags : []);

      const setupRequired = isGeneratedUsername(payload?.profile?.username);
      setForceProfileSetup(setupRequired);
      if (setupRequired) {
        viewHistoryRef.current = ["home"];
        navigateToView("profile", { recordHistory: false });
      }
    }

    loadAccess();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const handlePlayProfileTrack = (item, artist, queueItems) => {
    if (!item?.asset?.url) {
      return;
    }

    if (currentTrack?.track?.id === item.id) {
      setIsPlaying((current) => !current);
      return;
    }

    const queue = (queueItems || [])
      .filter((queueItem) => queueItem?.asset?.url)
      .map((queueItem) => createProfileQueueEntry(queueItem, artist));

    const nextQueueIndex = queue.findIndex((entry) => entry.track.id === item.id);
    if (nextQueueIndex === -1) {
      return;
    }

    setPlaybackQueue(queue);
    setQueueIndex(nextQueueIndex);
    setCurrentTrack(queue[nextQueueIndex] || null);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  };

  const handleAddProfileTrackToQueue = (item, artist, queueItems) => {
    if (!item?.asset?.url) {
      return "invalid";
    }

    const nextEntry = createProfileQueueEntry(item, artist);

    if (!currentTrack) {
      setPlaybackQueue([nextEntry]);
      setQueueIndex(0);
      setCurrentTrack(nextEntry);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return "added";
    }

    const queueSource = playbackQueue.length > 0
      ? playbackQueue
      : (queueItems || [])
          .filter((queueItem) => queueItem?.asset?.url)
          .map((queueItem) => createProfileQueueEntry(queueItem, artist));

    if (queueSource.some((entry) => entry.track.id === item.id)) {
      return "exists";
    }

    setPlaybackQueue([...queueSource, nextEntry]);
    return "added";
  };

  const handleDeletedProfileTrack = (mediaItemId) => {
    const removedIndex = playbackQueue.findIndex((entry) => entry.track.id === mediaItemId);
    const nextQueue = playbackQueue.filter((entry) => entry.track.id !== mediaItemId);

    setPlaybackQueue(nextQueue);

    if (currentTrack?.track?.id === mediaItemId) {
      setIsPlaying(false);
      setCurrentTrack(null);
      setQueueIndex(-1);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (removedIndex !== -1 && removedIndex < queueIndex) {
      setQueueIndex((currentIndex) => Math.max(0, currentIndex - 1));
      return;
    }

    if (nextQueue.length === 0) {
      setQueueIndex(-1);
    }
  };

  const handleProfileMediaItemUpdated = (item) => {
    if (!item?.id) {
      return;
    }

    setPlaybackQueue((currentQueue) =>
      currentQueue.map((entry) =>
        entry.track.id === item.id
          ? {
              ...entry,
              track: {
                ...entry.track,
                title: item.title,
                audioUrl: item.asset?.url || entry.track.audioUrl,
              },
              release: {
                ...entry.release,
                title: item.title,
                coverArt: item.coverAsset?.url || entry.release.coverArt,
              },
            }
          : entry,
      ),
    );

    setCurrentTrack((current) => {
      if (current?.track?.id !== item.id) {
        return current;
      }

      return {
        ...current,
        track: {
          ...current.track,
          title: item.title,
          audioUrl: item.asset?.url || current.track.audioUrl,
        },
        release: {
          ...current.release,
          title: item.title,
          coverArt: item.coverAsset?.url || current.release.coverArt,
        },
      };
    });
  };

  const handleSeekTrack = (time, audioElement) => {
    seekTrack(time, audioElement);
  };

  const handleSkipTrack = (direction) => {
    skipTrack(direction);
  };

  const handlePlayFeedTrack = (item, feedItems) => {
    if (!item?.asset?.url) {
      return;
    }

    if (currentTrack?.track?.id === item.id) {
      setIsPlaying((current) => !current);
      return;
    }

    const queue = (feedItems || [])
      .filter((feedItem) => feedItem?.mediaKind === "music" && feedItem?.asset?.url)
      .map((feedItem) => createFeedQueueEntry(feedItem));

    const nextQueueIndex = queue.findIndex((entry) => entry.track.id === item.id);
    if (nextQueueIndex === -1) {
      return;
    }

    setPlaybackQueue(queue);
    setQueueIndex(nextQueueIndex);
    setCurrentTrack(queue[nextQueueIndex] || null);
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  };

  const handleAddFeedTrackToQueue = (item, feedItems) => {
    if (!item?.asset?.url) {
      return "invalid";
    }

    const nextEntry = createFeedQueueEntry(item);

    if (!currentTrack) {
      setPlaybackQueue([nextEntry]);
      setQueueIndex(0);
      setCurrentTrack(nextEntry);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return "added";
    }

    const queueSource =
      playbackQueue.length > 0
        ? playbackQueue
        : (feedItems || [])
            .filter((feedItem) => feedItem?.mediaKind === "music" && feedItem?.asset?.url)
            .map((feedItem) => createFeedQueueEntry(feedItem));

    if (queueSource.some((entry) => entry.track.id === item.id)) {
      return "exists";
    }

    setPlaybackQueue([
      ...(queueSource.length > 0 ? queueSource : [currentTrack]),
      nextEntry,
    ]);
    return "added";
  };

  const canLeaveProfileSetup = !forceProfileSetup;
  const openOwnProfile = () => {
    if (forceProfileSetup || !profileUsername) {
      navigateToView("profile");
      return;
    }

    rememberRootViewReturn(currentView);
    router.push(buildPublicProfilePath(profileUsername));
  };

  const openOwnProfileSettings = () => {
    if (currentView === "profile") {
      setProfileNavigationIntent("settings");
      return;
    }

    if (forceProfileSetup || !profileUsername) {
      setProfileNavigationIntent("settings");
      navigateToView("profile");
      return;
    }

    rememberRootViewReturn(currentView);
    router.push(`${buildPublicProfilePath(profileUsername)}#settings`);
  };

  const openOwnProfileUpload = () => {
    if (currentView === "profile") {
      setProfileNavigationIntent("upload");
      return;
    }

    setShowGlobalUploadFlow(true);
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="relative min-h-screen pb-32">
        {/* Interactive Background */}
        <InteractiveBackground />

        {/* Content */}
        <div className="relative z-10">
          <SiteNavigation
            canModerate={isAdmin || isModerator}
            onHome={canLeaveProfileSetup ? () => navigateToView("home") : undefined}
            onAdmin={canLeaveProfileSetup && (isAdmin || isModerator) ? () => navigateToView("admin") : undefined}
            onMyProfile={openOwnProfile}
            onUpload={openOwnProfileUpload}
            onAccountSettings={openOwnProfileSettings}
            onSignOut={() => setShowSignOutConfirm(true)}
            profileAvatarUrl={profileAvatarUrl}
            profileDisplayName={profileDisplayName}
            disableHome={!canLeaveProfileSetup}
            disableProfileActions={false}
          />

          {/* Main Content Area */}
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentView}
                initial={FADE_UP_ANIMATION.initial}
                animate={FADE_UP_ANIMATION.animate}
                exit={FADE_UP_ANIMATION.exit}
                transition={PAGE_TRANSITION}
              >
            {currentView === 'home' && (
              <div>
                {/* Welcome Header */}
                <div className="text-center mb-8 md:mb-12">
                  <h2 className="text-3xl md:text-4xl mb-6">welcome</h2>
                  <div className="flex flex-col items-center gap-3">
                    <motion.button
                      type="button"
                      onClick={() => navigateToView('announcements')}
                      className="border border-white/40 px-5 py-3 text-sm tracking-wide transition-colors hover:border-white/60 hover:bg-white/10"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      community announcements
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => navigateToView('categories')}
                      className="border border-white/40 px-5 py-3 text-sm tracking-wide transition-colors hover:border-white/60 hover:bg-white/10"
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      browse artists
                    </motion.button>
                  </div>
                </div>

                {/* Feed Section */}
                <Feed 
                  onArtistClick={(artist) => openPublicProfile(artist, "home")}
                  onPlayTrack={handlePlayFeedTrack}
                  onAddToQueue={handleAddFeedTrackToQueue}
                  onOpenItem={(item) => openPublicMediaItem(item, "home")}
                  onOpenProfile={openOwnProfile}
                  currentTrackId={currentTrack?.track?.id || ""}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  onSeekTrack={handleSeekTrack}
                />
              </div>
            )}

            {currentView === 'categories' && (
              <CategorySelector
                onCategorySelect={(category) => {
                  if (!canLeaveProfileSetup) return;
                  if (category === 'music') navigateToView('browse-music');
                  else if (category === 'visual') navigateToView('browse-visual');
                  else if (category === 'video') navigateToView('browse-video');
                }}
                onBack={() => {
                  if (!canLeaveProfileSetup) return;
                  goBackView('home');
                }}
              />
            )}

            {currentView === 'announcements' && (
              <CommunityAnnouncementsBoard onBack={() => goBackView('home')} />
            )}

            {currentView === 'browse-music' && (
              <BrowseArtists 
                onArtistClick={(artist) => openPublicProfile(artist, "browse-music")}
                onBack={() => goBackView('categories')}
              />
            )}

            {currentView === 'browse-visual' && (
              <BrowseVisualArtists 
                onArtistClick={(artist) => openPublicProfile(artist, "browse-visual")}
                onBack={() => goBackView('categories')}
              />
            )}

            {currentView === 'browse-video' && (
              <BrowseVideoArtists 
                onArtistClick={(artist) => openPublicProfile(artist, "browse-video")}
                onBack={() => goBackView('categories')}
              />
            )}

            {currentView === 'profile' && (
              <MyProfile
                forceSetup={forceProfileSetup}
                onSetupComplete={() => setForceProfileSetup(false)}
                onBack={() => goBackView('home')}
                navigationIntent={profileNavigationIntent}
                onNavigationIntentHandled={() => setProfileNavigationIntent("")}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlayTrack={handlePlayProfileTrack}
                onAddTrackToQueue={handleAddProfileTrackToQueue}
                onTrackDeleted={handleDeletedProfileTrack}
                onMediaItemUpdated={handleProfileMediaItemUpdated}
                currentTime={currentTime}
                duration={duration}
                onSeekTrack={handleSeekTrack}
              />
            )}

            {currentView === 'admin' && (isAdmin || isModerator) && (
              <AdminPanel onBack={() => goBackView('home')} />
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>

      {/* Sign Out Confirmation */}
      {showSignOutConfirm && (
        <ViewportPortal>
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSignOutConfirm(false)}
          >
            <motion.div
              className="bg-black border-2 border-white/20 p-10 max-w-md w-full mx-4"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={PAGE_TRANSITION}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl mb-4 tracking-wide">are you sure?</h3>
              <p className="text-gray-400 mb-8 tracking-wide">you&apos;ll need to sign back in to access your profile</p>

              <div className="flex gap-4">
                <motion.button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="flex-1 px-6 py-4 border border-white/40 hover:border-white/60 hover:bg-white/5 transition-all duration-300 relative group"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <span className="text-base tracking-wide">cancel</span>
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                    initial={{ scaleX: 0 }}
                    whileHover={{ scaleX: 1 }}
                    transition={PAGE_TRANSITION}
                  />
                </motion.button>

                <motion.button
                  onClick={async () => {
                    await onSignOut();
                    setShowSignOutConfirm(false);
                  }}
                  className="flex-1 px-6 py-4 border border-red-500/60 hover:border-red-500 hover:bg-red-500/10 transition-all duration-300 relative group"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  <span className="text-base tracking-wide text-red-400 group-hover:text-red-300">sign out</span>
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500"
                    initial={{ scaleX: 0 }}
                    whileHover={{ scaleX: 1 }}
                    transition={PAGE_TRANSITION}
                  />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </ViewportPortal>
      )}

      <GlobalUploadFlow
        isOpen={showGlobalUploadFlow}
        categoryTags={profileCategoryTags}
        onClose={() => setShowGlobalUploadFlow(false)}
      />
    </div>
  );
}
