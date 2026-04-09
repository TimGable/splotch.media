import { notFound } from "next/navigation";
import { PublicMediaPage } from "@/app/components/public-media-page";
import { getPublicMediaPageData } from "@/lib/public-media";

export default async function PublicMediaRoute({
  params,
}: {
  params: Promise<{ username: string; mediaSlug: string }>;
}) {
  const { username, mediaSlug } = await params;
  const data = await getPublicMediaPageData(username, mediaSlug);

  if (!data) {
    notFound();
  }

  return <PublicMediaPage profile={data.profile} item={data.item} publicItems={data.publicItems} />;
}
