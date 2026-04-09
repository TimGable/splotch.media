import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { SignIn } from "./sign-in";
import { RequestInvite } from "./request-invite";
import { BrowseArtists } from "./browse-artists";
import { BrowseVisualArtists } from "./browse-visual-artists";
import { BrowseVideoArtists } from "./browse-video-artists";
import { CategorySelector } from "./category-selector";
import { InteractiveBackground } from "./interactive-background";
import { buildPublicProfilePath } from "@/lib/media-slugs";
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

export function LandingPage({ onSignIn, onForgotPassword }) {
  const router = useRouter();
  const [showCategories, setShowCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showRequestInvite, setShowRequestInvite] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const viewHistoryRef = useRef([]);

  const getCurrentLandingView = () => {
    if (showSignIn) return "sign-in";
    if (showRequestInvite) return "request-invite";
    if (selectedCategory === "music") return "browse-music";
    if (selectedCategory === "visual") return "browse-visual";
    if (selectedCategory === "video") return "browse-video";
    if (showCategories) return "categories";
    return "home";
  };

  const applyLandingView = (view) => {
    setShowSignIn(view === "sign-in");
    setShowRequestInvite(view === "request-invite");

    if (view === "categories") {
      setShowCategories(true);
      setSelectedCategory(null);
      return;
    }

    if (view === "browse-music") {
      setShowCategories(false);
      setSelectedCategory("music");
      return;
    }

    if (view === "browse-visual") {
      setShowCategories(false);
      setSelectedCategory("visual");
      return;
    }

    if (view === "browse-video") {
      setShowCategories(false);
      setSelectedCategory("video");
      return;
    }

    setShowCategories(false);
    setSelectedCategory(null);
  };

  const navigateLanding = (nextView, { recordHistory = true } = {}) => {
    const currentView = getCurrentLandingView();
    if (currentView === nextView) {
      return;
    }

    if (recordHistory) {
      const currentHistory = viewHistoryRef.current;
      if (currentHistory[currentHistory.length - 1] !== currentView) {
        viewHistoryRef.current = [...currentHistory, currentView];
      }
    }

    applyLandingView(nextView);
  };

  const goBackLanding = (fallbackView = "home") => {
    const currentHistory = viewHistoryRef.current;
    const previousView = currentHistory[currentHistory.length - 1];

    if (!previousView) {
      applyLandingView(fallbackView);
      return;
    }

    viewHistoryRef.current = currentHistory.slice(0, -1);
    applyLandingView(previousView);
  };

  useEffect(() => {
    const initialView = consumeInitialRootView();
    if (!initialView) {
      return;
    }

    viewHistoryRef.current = getRootViewHistorySeed(initialView);
    navigateLanding(initialView, { recordHistory: false });
  }, []);

  const openPublicProfile = (artist, returnView) => {
    if (typeof window === "undefined" || !artist?.username) {
      return;
    }

    if (returnView) {
      rememberRootViewReturn(returnView);
    }

    router.push(buildPublicProfilePath(artist.username));
  };

  if (showSignIn) {
    return (
      <SignIn
        onBack={() => goBackLanding()}
        onSignIn={onSignIn}
        onForgotPassword={onForgotPassword}
        onRequestInvite={() => navigateLanding("request-invite")}
      />
    );
  }

  if (showRequestInvite) {
    return <RequestInvite onBack={() => goBackLanding()} />;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Hero Section */}
      <div className={`relative ${!showCategories && !selectedCategory ? 'min-h-screen flex items-center justify-center' : 'min-h-screen'}`}>
        {/* Interactive Background */}
        <InteractiveBackground />
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
          <AnimatePresence mode="wait">
            {selectedCategory === 'music' ? (
              <motion.div
                key="music-browse"
                initial={FADE_UP_ANIMATION.initial}
                animate={FADE_UP_ANIMATION.animate}
                exit={FADE_UP_ANIMATION.exit}
                transition={PAGE_TRANSITION}
              >
                <BrowseArtists
                  onArtistClick={(artist) => openPublicProfile(artist, "browse-music")}
                  onBack={() => goBackLanding("categories")}
                />
              </motion.div>
            ) : selectedCategory === 'visual' ? (
              <motion.div
                key="visual-browse"
                initial={FADE_UP_ANIMATION.initial}
                animate={FADE_UP_ANIMATION.animate}
                exit={FADE_UP_ANIMATION.exit}
                transition={PAGE_TRANSITION}
              >
                <BrowseVisualArtists
                  onArtistClick={(artist) => openPublicProfile(artist, "browse-visual")}
                  onBack={() => goBackLanding("categories")}
                />
              </motion.div>
            ) : selectedCategory === 'video' ? (
              <motion.div
                key="video-browse"
                initial={FADE_UP_ANIMATION.initial}
                animate={FADE_UP_ANIMATION.animate}
                exit={FADE_UP_ANIMATION.exit}
                transition={PAGE_TRANSITION}
              >
                <BrowseVideoArtists
                  onArtistClick={(artist) => openPublicProfile(artist, "browse-video")}
                  onBack={() => goBackLanding("categories")}
                />
              </motion.div>
            ) : showCategories ? (
              <motion.div
                key="categories"
                initial={FADE_UP_ANIMATION.initial}
                animate={FADE_UP_ANIMATION.animate}
                exit={FADE_UP_ANIMATION.exit}
                transition={PAGE_TRANSITION}
              >
                <CategorySelector
                  onCategorySelect={(category) => {
                    if (category === "music") navigateLanding("browse-music");
                    else if (category === "visual") navigateLanding("browse-visual");
                    else if (category === "video") navigateLanding("browse-video");
                  }}
                  onBack={() => goBackLanding("home")}
                  showBackButton={true}
                />
              </motion.div>
            ) : (
              <div className="text-center flex items-center justify-center min-h-[60vh]">
                <motion.div
                  key="landing"
                  initial={FADE_UP_ANIMATION.initial}
                  animate={FADE_UP_ANIMATION.animate}
                  exit={FADE_UP_ANIMATION.exit}
                  transition={PAGE_TRANSITION}
                >
                  {/* Logo/Brand */}
                  <motion.div 
                    className="mb-16"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...PAGE_TRANSITION, delay: 0.12 }}
                  >
                    <h1 className="text-4xl md:text-5xl lg:text-6xl tracking-tight mb-4">our media archive</h1>
                    <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-400 md:text-base">
                      An invite-only archive for music, visual art, and video, built around artist-owned pages,
                      persistent playback, and direct public sharing.
                    </p>
                  </motion.div>

                  {/* CTA Buttons */}
                  <motion.div 
                    className="flex flex-col items-center gap-4 md:gap-6 mb-16 max-w-md mx-auto w-full px-4"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...PAGE_TRANSITION, delay: 0.2 }}
                  >
                    {/* Browse Artists - Big Button */}
                    <motion.button
                      onClick={() => navigateLanding("categories")}
                      className="w-full group relative px-8 md:px-12 py-6 md:py-8 border-2 border-white overflow-hidden bg-transparent transition-all duration-300 active:scale-95 touch-manipulation"
                      onHoverStart={() => setHoveredButton('browse')}
                      onHoverEnd={() => setHoveredButton(null)}
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <motion.div 
                        className="absolute inset-0 bg-white"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: hoveredButton === 'browse' ? 1 : 0 }}
                        transition={PAGE_TRANSITION}
                        style={{ originX: 0 }}
                      />
                      <motion.span 
                        className="relative z-10 text-xl md:text-2xl tracking-wide"
                        animate={{ 
                          color: hoveredButton === 'browse' ? '#000000' : '#ffffff',
                          letterSpacing: hoveredButton === 'browse' ? '0.1em' : '0.025em'
                        }}
                        transition={PAGE_TRANSITION}
                      >
                        Browse Artists
                      </motion.span>
                    </motion.button>
                  
                    {/* Sign In and Request Invite - Smaller Buttons Side by Side */}
                    <motion.div 
                      className="w-full flex gap-3 md:gap-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ ...PAGE_TRANSITION, delay: 0.28 }}
                    >
                      <motion.button 
                        className="flex-1 group relative px-4 md:px-6 py-4 border border-white/40 overflow-hidden bg-white/5 hover:border-white/60 hover:bg-white/15 transition-all duration-200 active:scale-95 touch-manipulation"
                        onClick={() => navigateLanding("sign-in")}
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        <span className="relative z-10 text-sm md:text-base tracking-wide text-white">
                          Sign In
                        </span>
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                          initial={{ scaleX: 0 }}
                          whileHover={{ scaleX: 1 }}
                          transition={PAGE_TRANSITION}
                        />
                      </motion.button>
                    
                      <motion.button 
                        className="flex-1 group relative px-4 md:px-6 py-4 border border-white/40 overflow-hidden bg-white/5 hover:border-white/60 hover:bg-white/15 transition-all duration-200 active:scale-95 touch-manipulation"
                        onClick={() => navigateLanding("request-invite")}
                        whileHover={SOFT_BUTTON_HOVER}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        <span className="relative z-10 text-sm md:text-base tracking-wide text-white">
                          Request Invite
                        </span>
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                          initial={{ scaleX: 0 }}
                          whileHover={{ scaleX: 1 }}
                          transition={PAGE_TRANSITION}
                        />
                      </motion.button>
                    </motion.div>

                    {/* About Button */}
                    <motion.button
                      onClick={() => setShowAbout(!showAbout)}
                      className="relative group px-6 py-2 border border-white/20 hover:border-white/40 transition-all duration-300 overflow-hidden touch-manipulation"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...PAGE_TRANSITION, delay: 0.32 }}
                      whileHover={SOFT_BUTTON_HOVER}
                      whileTap={SOFT_BUTTON_TAP}
                    >
                      <span className="relative z-10 text-xs md:text-sm tracking-widest text-gray-400 group-hover:text-white transition-colors">
                        {showAbout ? 'close' : 'about'}
                      </span>
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/5"
                        initial={{ x: '-100%' }}
                        whileHover={{ x: '100%' }}
                        transition={PAGE_TRANSITION}
                      />
                    </motion.button>
                  </motion.div>

                  {/* About Content Box - Positioned absolutely below buttons */}
                  <AnimatePresence>
                    {showAbout && (
                      <motion.div
                        className="w-full max-w-lg mx-auto px-4 overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ 
                          ...PAGE_TRANSITION,
                        }}
                      >
                        <motion.div 
                          className="pt-4 space-y-5 text-gray-300 leading-relaxed"
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -10, opacity: 0 }}
                          transition={{ 
                            ...PAGE_TRANSITION,
                            delay: 0.1
                          }}
                        >
                          <p className="text-center md:text-left">
                            our media archive is a community based, independently operated media platform for artists of all kinds.
                          </p>
                          
                          <p className="text-center md:text-left">
                            we are currently invite only, but hope to open our platform up to all artists at some point in the future.
                          </p>
                          
                          <p className="text-center md:text-left">
                            if you have more questions, feel free to email me at{' '}
                            <a
                              href="mailto:1timgable@gmail.com"
                              className="text-white underline hover:text-gray-400 transition-colors"
                            >
                              1timgable@gmail.com
                            </a>
                          </p>
                          
                          <p className="text-sm text-gray-500 italic text-center md:text-left pb-4">
                            thank you for visiting!
                          </p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
