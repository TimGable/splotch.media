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

function getMediaSlugIdentity(item: { id: string; title: string; collectionId?: string | null; collectionTitle?: string | null; releaseType?: string | null }) {
  const isMultiTrackRelease = item.collectionId && item.releaseType && item.releaseType !== "single";
  if (!isMultiTrackRelease) {
    return {
      id: item.id,
      title: item.title,
    };
  }

  return {
    id: item.collectionId || item.id,
    title: item.collectionTitle || item.title,
  };
}

export function attachPublicMediaSlugs<
  T extends {
    id: string;
    title: string;
    collectionId?: string | null;
    collectionTitle?: string | null;
    releaseType?: string | null;
  },
>(items: T[]) {
  const baseSlugCounts = new Map<string, number>();

  for (const item of items) {
    const slugIdentity = getMediaSlugIdentity(item);
    const baseSlug = slugifyMediaTitle(slugIdentity.title);
    baseSlugCounts.set(baseSlug, (baseSlugCounts.get(baseSlug) || 0) + 1);
  }

  return items.map((item) => {
    const slugIdentity = getMediaSlugIdentity(item);
    const baseSlug = slugifyMediaTitle(slugIdentity.title);
    const hasCollision = (baseSlugCounts.get(baseSlug) || 0) > 1;

    return {
      ...item,
      slug: hasCollision ? `${baseSlug}-${slugIdentity.id.slice(0, 8)}` : baseSlug,
    };
  });
}

export function buildPublicProfilePath(username: string) {
  return `/${encodeURIComponent(normalizeUsername(username))}`;
}

export function buildPublicMediaPath(username: string, mediaSlug: string) {
  return `${buildPublicProfilePath(username)}/${encodeURIComponent(String(mediaSlug || "").trim())}`;
}
