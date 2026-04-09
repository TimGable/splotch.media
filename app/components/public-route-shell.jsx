"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { InteractiveBackground } from "./interactive-background";
import { SiteNavigation } from "./site-navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildPublicProfilePath } from "@/lib/media-slugs";
import { rememberCurrentPathReturn } from "@/lib/public-navigation";
import { FADE_UP_ANIMATION, PAGE_TRANSITION } from "@/lib/motion";

function isGeneratedUsername(username) {
  return typeof username === "string" && /_[a-f0-9]{8}$/.test(username);
}

export function PublicRouteShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [forceProfileSetup, setForceProfileSetup] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setIsSignedIn(Boolean(session));

      if (!session?.access_token) {
        setIsAdmin(false);
        setProfileUsername("");
        setForceProfileSetup(false);
        return;
      }

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
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
      setProfileUsername(payload?.profile?.username || "");
      setProfileAvatarUrl(payload?.profile?.avatarUrl || "");
      setProfileDisplayName(payload?.profile?.displayName || "");
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
  }, [supabase]);

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

    rememberCurrentPathReturn();
    router.push(`${buildPublicProfilePath(profileUsername)}#settings`);
  };

  const handleUpload = () => {
    if (!isSignedIn) {
      router.push("/");
      return;
    }

    if (!profileUsername || forceProfileSetup) {
      router.push("/#profile");
      return;
    }

    rememberCurrentPathReturn();
    router.push(`${buildPublicProfilePath(profileUsername)}#upload`);
  };

  const handleAdmin = () => {
    router.push("/#admin");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="relative min-h-screen pb-32">
        <InteractiveBackground />

        <div className="relative z-10">
          <SiteNavigation
            isAdmin={isSignedIn && isAdmin}
            onHome={handleHome}
            onUpload={isSignedIn ? handleUpload : undefined}
            onAccountSettings={isSignedIn ? handleAccountSettings : undefined}
            onAdmin={isSignedIn && isAdmin ? handleAdmin : undefined}
            onSignOut={isSignedIn ? handleSignOut : undefined}
            profileAvatarUrl={profileAvatarUrl}
            profileDisplayName={profileDisplayName}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
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
    </div>
  );
}
