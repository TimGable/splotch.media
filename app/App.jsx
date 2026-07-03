"use client";

import { useEffect, useMemo, useState } from "react";
import { LandingPage } from "./components/landing-page";
import { Dashboard } from "./components/dashboard";
import { FirstTimePasswordChange } from "./components/first-time-password-change";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function App() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFirstTimePasswordChange, setShowFirstTimePasswordChange] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Keep the first screen blank until Supabase confirms whether a user session already exists.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setShowDashboard(Boolean(data.session));
      })
      .catch((error) => {
        console.error("Failed to initialize auth session:", error);
        if (!mounted) return;
        setShowDashboard(false);
      })
      .finally(() => {
        if (!mounted) return;
        setIsAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setShowDashboard(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleFirstTimePasswordComplete = () => {
    setShowFirstTimePasswordChange(false);
  };

  const handleSignIn = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const raw = (error.message || "").toLowerCase();
        if (raw.includes("invalid login credentials")) {
          return {
            success: false,
            error: "Sign-in attempt failed. Invalid email or password.",
          };
        }
        if (raw.includes("email not confirmed")) {
          return {
            success: false,
            error: "Sign-in attempt failed. Your email is not confirmed yet.",
          };
        }
        if (raw.includes("invalid credentials") || raw.includes("configuration")) {
          return {
            success: false,
            error: "Sign-in attempt failed. Authentication is temporarily unavailable.",
          };
        }
        return {
          success: false,
          error: "Sign-in attempt failed. Please try again.",
        };
      }

      const isFirstTimeLogin = false;
      if (isFirstTimeLogin) {
        setShowFirstTimePasswordChange(true);
      }

      return { success: true };
    } catch (error) {
      console.error("Unexpected sign-in failure:", error);
      return {
        success: false,
        error: "Sign-in attempt failed. Authentication is temporarily unavailable.",
      };
    }
  };

  const handleForgotPassword = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return {
        success: false,
        error: "Enter the email address for your account first.",
      };
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: payload?.error || "Failed to send password reset email.",
        };
      }

      return {
        success: true,
        message:
          payload?.message || "Password reset email sent. Check your inbox and spam folder.",
      };
    } catch (error) {
      console.error("Unexpected forgot-password failure:", error);
      return {
        success: false,
        error: "Failed to send password reset email. Please try again.",
      };
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setShowDashboard(false);
  };

  if (!isAuthReady) return null;

  if (showDashboard) {
    return (
      <div className="size-full">
        {showFirstTimePasswordChange ? (
          <FirstTimePasswordChange onComplete={handleFirstTimePasswordComplete} />
        ) : (
          <Dashboard onSignOut={handleSignOut} />
        )}
      </div>
    );
  }

  return (
    <div className="size-full">
      <LandingPage onSignIn={handleSignIn} onForgotPassword={handleForgotPassword} />
    </div>
  );
}
