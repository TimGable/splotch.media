"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { InteractiveBackground } from "./interactive-background";
import { SiteNavigation } from "./site-navigation";
import { GlobalUploadFlow } from "./global-upload-flow";
import { createSupabaseBrowserClient, getStoredSupabaseAccessToken } from "@/lib/supabase/client";
import { buildPublicProfilePath } from "@/lib/media-slugs";
import { rememberCurrentPathReturn } from "@/lib/public-navigation";
import { FADE_UP_ANIMATION, PAGE_TRANSITION } from "@/lib/motion";

function isGeneratedUsername(username) {
  return typeof username === "string" && /_[a-f0-9]{8}$/.test(username);
}

export function PublicRouteShell({ children, requireAuth = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [hasInitialAccessToken] = useState(() =>
    typeof window === "undefined" ? true : Boolean(getStoredSupabaseAccessToken()),
  );
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileCategoryTags, setProfileCategoryTags] = useState([]);
  const [forceProfileSetup, setForceProfileSetup] = useState(false);
  const [showGlobalUploadFlow, setShowGlobalUploadFlow] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const accessToken = getStoredSupabaseAccessToken();

      if (!mounted) {
        return;
      }

      setIsSignedIn(Boolean(accessToken));

      if (!accessToken) {
        setIsAdmin(false);
        setIsModerator(false);
        setProfileUsername("");
        setProfileCategoryTags([]);
        setForceProfileSetup(false);
        if (requireAuth) {
          router.replace("/");
        }
        return;
      }

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!mounted || !response.ok) {
        return;
      }

      const payload = await response.json().catch(() => ({}));
      if (!mounted) {
        return;
      }

      setIsAdmin(Boolean(payload?.profile?.isAdmin));
      setIsModerator(Boolean(payload?.profile?.isModerator));
      setProfileUsername(payload?.profile?.username || "");
      setProfileAvatarUrl(payload?.profile?.avatarUrl || "");
      setProfileDisplayName(payload?.profile?.displayName || "");
      setProfileCategoryTags(Array.isArray(payload?.profile?.categoryTags) ? payload.profile.categoryTags : []);
      setForceProfileSetup(isGeneratedUsername(payload?.profile?.username));
    }

    loadAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAccess();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [requireAuth, router, supabase]);

  const handleHome = () => {
    router.push(isSignedIn ? "/#home" : "/");
  };

  const handleAccountSettings = () => {
    if (!isSignedIn) {
      router.push("/");
      return;
    }

    if (!profileUsername || forceProfileSetup) {
      router.push("/#profile");
      return;
    }

    const targetPath = buildPublicProfilePath(profileUsername);
    if (pathname === targetPath && typeof window !== "undefined") {
      rememberCurrentPathReturn();
      window.location.hash = "settings";
      return;
    }

    rememberCurrentPathReturn();
    router.push(`${targetPath}#settings`);
  };

  const handleMyProfile = () => {
    if (!isSignedIn) {
      router.push("/");
      return;
    }

    if (!profileUsername || forceProfileSetup) {
      router.push("/#profile");
      return;
    }

    rememberCurrentPathReturn();
    router.push(buildPublicProfilePath(profileUsername));
  };

  const handleUpload = () => {
    if (!isSignedIn) {
      router.push("/");
      return;
    }

    setShowGlobalUploadFlow(true);
  };

  const handleAdmin = () => {
    router.push("/#admin");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (requireAuth && !hasInitialAccessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="relative min-h-screen pb-32">
        <InteractiveBackground />

        <div className="relative z-10">
          <SiteNavigation
            canModerate={isSignedIn && (isAdmin || isModerator)}
            onHome={handleHome}
            onMyProfile={isSignedIn ? handleMyProfile : undefined}
            onUpload={isSignedIn ? handleUpload : undefined}
            onAccountSettings={isSignedIn ? handleAccountSettings : undefined}
            onAdmin={isSignedIn && (isAdmin || isModerator) ? handleAdmin : undefined}
            onSignOut={isSignedIn ? handleSignOut : undefined}
            profileAvatarUrl={profileAvatarUrl}
            profileDisplayName={profileDisplayName}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={pathname || "__route__"}
              initial={FADE_UP_ANIMATION.initial}
              animate={FADE_UP_ANIMATION.animate}
              exit={FADE_UP_ANIMATION.exit}
              transition={PAGE_TRANSITION}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <GlobalUploadFlow
        isOpen={showGlobalUploadFlow}
        categoryTags={profileCategoryTags}
        onClose={() => setShowGlobalUploadFlow(false)}
      />
    </div>
  );
}
