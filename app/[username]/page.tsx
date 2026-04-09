import { notFound } from "next/navigation";
import { PublicProfilePage } from "@/app/components/public-profile-page";
import { getPublicProfilePageData } from "@/lib/public-media";

export default async function PublicProfileRoute({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getPublicProfilePageData(username);

  if (!data) {
    notFound();
  }

  return (
    <PublicProfilePage
      profile={data.profile}
      items={data.items}
      likedTracks={data.likedTracks}
    />
  );
}
