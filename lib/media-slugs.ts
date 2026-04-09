function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function slugifyMediaTitle(value: string) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled";
}

export function attachPublicMediaSlugs<T extends { id: string; title: string }>(items: T[]) {
  const baseSlugCounts = new Map<string, number>();

  for (const item of items) {
    const baseSlug = slugifyMediaTitle(item.title);
    baseSlugCounts.set(baseSlug, (baseSlugCounts.get(baseSlug) || 0) + 1);
  }

  return items.map((item) => {
    const baseSlug = slugifyMediaTitle(item.title);
    const hasCollision = (baseSlugCounts.get(baseSlug) || 0) > 1;

    return {
      ...item,
      slug: hasCollision ? `${baseSlug}-${item.id.slice(0, 8)}` : baseSlug,
    };
  });
}

export function buildPublicProfilePath(username: string) {
  return `/${encodeURIComponent(normalizeUsername(username))}`;
}

export function buildPublicMediaPath(username: string, mediaSlug: string) {
  return `${buildPublicProfilePath(username)}/${encodeURIComponent(String(mediaSlug || "").trim())}`;
}
