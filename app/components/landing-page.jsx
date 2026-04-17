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
import { SiteSearch } from "./site-search";
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
  const [supportsHoverMotion, setSupportsHoverMotion] = useState(false);
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

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHoverSupport = () => setSupportsHoverMotion(mediaQuery.matches);

    updateHoverSupport();
    mediaQuery.addEventListener("change", updateHoverSupport);

    return () => {
      mediaQuery.removeEventListener("change", updateHoverSupport);
    };
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
        <div className="relative z-10 max-w-7xl mx-auto px-5 py-8 md:px-6 md:py-12">
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
              <div className="text-center flex items-center justify-center min-h-[52vh] md:min-h-[60vh]">
                <motion.div
                  key="landing"
                  className="w-full"
                  initial={FADE_UP_ANIMATION.initial}
                  animate={FADE_UP_ANIMATION.animate}
                  exit={FADE_UP_ANIMATION.exit}
                  transition={PAGE_TRANSITION}
                >
                  {/* Logo/Brand */}
                  <motion.div 
                    className="mb-8 md:mb-12"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...PAGE_TRANSITION, delay: 0.12 }}
                  >
                    <h1 className="text-3xl tracking-tight md:text-5xl lg:text-6xl">splotch</h1>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.26em] text-gray-500 md:mt-3 md:text-sm md:tracking-[0.3em]">
                      our media archive
                    </p>
                    <div className="mx-auto mt-6 w-full max-w-[22rem] md:mt-8 md:max-w-[34rem]">
                      <SiteSearch />
                    </div>
                  </motion.div>

                  {/* CTA Buttons */}
                  <motion.div 
                    className={`relative mx-auto mb-10 flex w-full flex-col items-center px-2 transition-[padding] duration-300 md:mb-16 md:px-4 ${
                      showAbout ? 'pb-[17rem] md:pb-[14rem]' : 'pb-0'
                    }`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...PAGE_TRANSITION, delay: 0.2 }}
                  >
                    {/* Browse Artists - Big Button */}
                    <motion.button
                      onClick={() => navigateLanding("categories")}
                      className="group relative flex h-16 w-full max-w-[22rem] items-center justify-center overflow-hidden border-2 border-white bg-transparent px-8 transition-all duration-300 active:scale-95 touch-manipulation md:h-[7rem] md:max-w-[34rem] md:px-12"
                      onHoverStart={() => {
                        if (supportsHoverMotion) setHoveredButton('browse');
                      }}
                      onHoverEnd={() => {
                        if (supportsHoverMotion) setHoveredButton(null);
                      }}
                      whileHover={supportsHoverMotion ? SOFT_BUTTON_HOVER : undefined}
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
                        className="relative z-10 text-base tracking-wide md:text-2xl"
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
                      className="mt-3 flex w-full flex-col items-center gap-3 md:mt-5 md:flex-row md:justify-center md:gap-5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ ...PAGE_TRANSITION, delay: 0.28 }}
                    >
                      <motion.button 
                        className="group relative flex h-14 w-full max-w-[22rem] items-center justify-center overflow-hidden border border-white/40 bg-white/5 px-5 transition-all duration-200 hover:border-white/60 hover:bg-white/15 active:scale-95 touch-manipulation md:h-[5.25rem] md:w-[16rem] md:max-w-none md:px-7"
                        onClick={() => navigateLanding("sign-in")}
                        whileHover={supportsHoverMotion ? SOFT_BUTTON_HOVER : undefined}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        <span className="relative z-10 whitespace-nowrap text-base tracking-wide text-white md:text-lg">
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
                        className="group relative flex h-14 w-full max-w-[22rem] items-center justify-center overflow-hidden border border-white/40 bg-white/5 px-5 transition-all duration-200 hover:border-white/60 hover:bg-white/15 active:scale-95 touch-manipulation md:h-[5.25rem] md:w-[16rem] md:max-w-none md:px-7"
                        onClick={() => navigateLanding("request-invite")}
                        whileHover={supportsHoverMotion ? SOFT_BUTTON_HOVER : undefined}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        <span className="relative z-10 whitespace-nowrap text-base tracking-wide text-white md:text-lg">
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
                    <div className="relative mx-auto mt-3 w-full max-w-[22rem] md:mt-5 md:w-28 md:max-w-none">
                      <motion.button
                        onClick={() => setShowAbout(!showAbout)}
                        className="relative group flex h-11 w-full items-center justify-center overflow-hidden border border-white/20 px-5 transition-all duration-300 hover:border-white/40 touch-manipulation md:h-10"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...PAGE_TRANSITION, delay: 0.32 }}
                        whileHover={supportsHoverMotion ? SOFT_BUTTON_HOVER : undefined}
                        whileTap={SOFT_BUTTON_TAP}
                      >
                        <span className="relative z-10 text-xs tracking-wide text-gray-400 transition-colors group-hover:text-white md:text-sm md:tracking-widest">
                          {showAbout ? 'close' : 'about'}
                        </span>
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/5"
                          initial={{ x: '-100%' }}
                          whileHover={{ x: '100%' }}
                          transition={PAGE_TRANSITION}
                        />
                      </motion.button>
                      <AnimatePresence>
                        {showAbout && (
                          <motion.div
                            className="absolute left-1/2 top-[calc(100%+1rem)] z-20 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden border border-white/15 bg-black/90 px-4 py-4 text-sm shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl md:text-base"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={PAGE_TRANSITION}
                          >
                            <div className="space-y-4 text-gray-300 leading-relaxed">
                              <p className="text-center md:text-left">
                                splotch is a community based, independently operated media platform for artists of all kinds.
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

                              <p className="text-sm text-gray-500 italic text-center md:text-left">
                                thank you for visiting!
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
