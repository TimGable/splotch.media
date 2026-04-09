export const SOFT_EASE = [0.22, 1, 0.36, 1];

export const PAGE_TRANSITION = {
  duration: 0.48,
  ease: SOFT_EASE,
};

export const FADE_UP_ANIMATION = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const CONTENT_SWAP_ANIMATION = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
};

export const PROFILE_PANEL_SWAP_ANIMATION = {
  initial: { opacity: 0, y: 10, scale: 0.992, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, scale: 1.006, filter: "blur(6px)" },
};

export const SOFT_BUTTON_HOVER = {
  y: -2,
  scale: 1.01,
  transition: {
    duration: 0.24,
    ease: SOFT_EASE,
  },
};

export const SOFT_BUTTON_TAP = {
  scale: 0.985,
  transition: {
    duration: 0.16,
    ease: SOFT_EASE,
  },
};

export const SOFT_CARD_HOVER = {
  y: -4,
  scale: 1.008,
  transition: {
    duration: 0.28,
    ease: SOFT_EASE,
  },
};

export const SOFT_PANEL_REVEAL = {
  initial: { opacity: 0, y: 16, scale: 0.985, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: 10, scale: 0.99, filter: "blur(8px)" },
};
