const PUBLIC_RETURN_TARGET_KEY = "oma-public-return-target";
const ROOT_VIEW_HASHES = new Set([
  "home",
  "categories",
  "browse-music",
  "browse-visual",
  "browse-video",
  "profile",
  "admin",
]);

export function rememberPublicReturnTarget(target: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PUBLIC_RETURN_TARGET_KEY, target);
}

export function rememberRootViewReturn(view: string) {
  if (!ROOT_VIEW_HASHES.has(view)) {
    rememberPublicReturnTarget("/");
    return;
  }

  rememberPublicReturnTarget(`/#${view}`);
}

export function rememberCurrentPathReturn() {
  if (typeof window === "undefined") {
    return;
  }

  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  rememberPublicReturnTarget(target || "/");
}

export function getPublicReturnTarget() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.sessionStorage.getItem(PUBLIC_RETURN_TARGET_KEY) || "/";
}

export function clearPublicReturnTarget() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PUBLIC_RETURN_TARGET_KEY);
}

export function getRootViewHistorySeed(view: string | null) {
  if (view === "categories") {
    return ["home"];
  }

  if (view === "browse-music" || view === "browse-visual" || view === "browse-video") {
    return ["home", "categories"];
  }

  if (view === "profile" || view === "admin") {
    return ["home"];
  }

  return [];
}

export function consumeInitialRootView() {
  if (typeof window === "undefined") {
    return null;
  }

  const nextHash = window.location.hash.replace(/^#/, "").trim();
  if (!ROOT_VIEW_HASHES.has(nextHash)) {
    return null;
  }

  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  return nextHash;
}
