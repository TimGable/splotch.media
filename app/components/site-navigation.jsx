"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, LogOut, Menu, Settings2, Upload, UserCircle2, X } from "lucide-react";
import { MessagesNavButton } from "./messages-nav-button";
import { NotificationsPopover } from "./notifications-popover";
import { SiteSearch } from "./site-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { PAGE_TRANSITION, SOFT_BUTTON_HOVER, SOFT_BUTTON_TAP, SOFT_EASE } from "@/lib/motion";

export function SiteNavigation({
  canModerate = false,
  onHome,
  onMyProfile,
  onUpload,
  onAccountSettings,
  onAdmin,
  onSignOut,
  profileAvatarUrl = "",
  profileDisplayName = "",
  disableHome = false,
  disableProfileActions = false,
}) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const closeMobileMenu = () => setShowMobileMenu(false);
  const avatarLabel = profileDisplayName || "Open profile menu";

  const profileMenu = onAccountSettings || onUpload || onSignOut ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          className="inline-flex h-12 cursor-pointer items-center gap-2.5 border border-white/15 px-3 text-gray-300 transition-colors hover:border-white/40 hover:text-white disabled:cursor-default disabled:opacity-50"
          whileHover={disableProfileActions ? undefined : SOFT_BUTTON_HOVER}
          whileTap={disableProfileActions ? undefined : SOFT_BUTTON_TAP}
          disabled={disableProfileActions}
          aria-label={avatarLabel}
        >
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04]">
            {profileAvatarUrl ? (
              <img
                src={profileAvatarUrl}
                alt={profileDisplayName || "Profile"}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserCircle2 className="h-5 w-5 text-white/70" />
            )}
          </div>
          <ChevronDown className="h-4.5 w-4.5 text-gray-500" />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[13rem] border-white/15 bg-black text-white"
      >
        {onMyProfile ? (
          <DropdownMenuItem
            onClick={() => {
              if (disableProfileActions) {
                return;
              }
              onMyProfile();
              closeMobileMenu();
            }}
            className="gap-2.5 px-3 py-2 text-white focus:bg-white/10 focus:text-white"
          >
            <UserCircle2 className="h-4 w-4 text-gray-400" />
            <span>my profile</span>
          </DropdownMenuItem>
        ) : null}
        {onUpload ? (
          <DropdownMenuItem
            onClick={() => {
              if (disableProfileActions) {
                return;
              }
              onUpload();
              closeMobileMenu();
            }}
            className="gap-2.5 px-3 py-2 text-white focus:bg-white/10 focus:text-white"
          >
            <Upload className="h-4 w-4 text-gray-400" />
            <span>upload</span>
          </DropdownMenuItem>
        ) : null}
        {onAccountSettings ? (
          <DropdownMenuItem
            onClick={() => {
              if (disableProfileActions) {
                return;
              }
              onAccountSettings();
              closeMobileMenu();
            }}
            className="gap-2.5 px-3 py-2 text-white focus:bg-white/10 focus:text-white"
          >
            <Settings2 className="h-4 w-4 text-gray-400" />
            <span>account settings</span>
          </DropdownMenuItem>
        ) : null}
        {onSignOut ? (
          <DropdownMenuItem
            onClick={() => {
              onSignOut();
              closeMobileMenu();
            }}
            className="gap-2.5 px-3 py-2 text-red-300 focus:bg-red-500/10 focus:text-red-200"
          >
            <LogOut className="h-4 w-4 text-red-300" />
            <span>logout</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <motion.nav
      className="relative z-[10000] border-b border-white/10 bg-black/50 backdrop-blur-sm"
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={PAGE_TRANSITION}
    >
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
        <div className="relative flex items-center justify-between gap-4">
          <motion.button
            type="button"
            className="cursor-pointer text-left text-xl tracking-wide transition-colors hover:text-gray-300 md:text-2xl disabled:cursor-default disabled:hover:text-white"
            onClick={() => {
              if (disableHome || !onHome) {
                return;
              }
              onHome();
              closeMobileMenu();
            }}
            whileHover={disableHome ? undefined : SOFT_BUTTON_HOVER}
            whileTap={disableHome ? undefined : SOFT_BUTTON_TAP}
            transition={PAGE_TRANSITION}
            disabled={disableHome || !onHome}
          >
            splotch
          </motion.button>

          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden w-full max-w-[32rem] -translate-x-1/2 -translate-y-1/2 px-6 lg:block">
            <div className="pointer-events-auto">
              <SiteSearch compact />
            </div>
          </div>

          <div className="hidden items-center justify-end gap-8 lg:flex">
            {canModerate && onAdmin ? (
              <motion.button
                type="button"
                onClick={onAdmin}
                className="relative cursor-pointer text-gray-400 transition-colors hover:text-white"
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
              >
                moderation page
                <motion.div
                  className="absolute -bottom-1 left-0 right-0 h-px bg-white"
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.28, ease: SOFT_EASE }}
                />
              </motion.button>
            ) : null}

            {(onAccountSettings || onUpload) ? (
              <div className="flex items-center gap-2">
                <MessagesNavButton />
                <NotificationsPopover />
              </div>
            ) : null}
            {profileMenu}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            {(onAccountSettings || onUpload) ? (
              <>
                <MessagesNavButton compact />
                <NotificationsPopover compact />
              </>
            ) : null}
            {profileMenu}
            {canModerate && onAdmin ? (
              <motion.button
                type="button"
                className="flex h-10 w-10 items-center justify-center"
                onClick={() => setShowMobileMenu((current) => !current)}
                whileHover={SOFT_BUTTON_HOVER}
                whileTap={SOFT_BUTTON_TAP}
                aria-label="Toggle navigation"
              >
                {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
              </motion.button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 lg:hidden">
          <SiteSearch compact />
        </div>
      </div>

      <AnimatePresence>
        {showMobileMenu && canModerate && onAdmin ? (
          <motion.div
            className="border-t border-white/10 bg-black/90 backdrop-blur-lg lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: SOFT_EASE }}
          >
            <div className="space-y-2 px-4 py-4">
              {canModerate && onAdmin ? (
                <motion.button
                  type="button"
                  onClick={() => {
                    onAdmin();
                    closeMobileMenu();
                  }}
                  className="w-full border border-white/10 px-4 py-3 text-left text-gray-400 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
                  whileHover={SOFT_BUTTON_HOVER}
                  whileTap={SOFT_BUTTON_TAP}
                >
                  moderation page
                </motion.button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.nav>
  );
}
