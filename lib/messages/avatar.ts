import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function createSignedAvatarUrl(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetId: string | null,
) {
  if (!assetId) {
    return null;
  }

  const { data: asset, error } = await supabase
    .from("media_assets")
    .select("bucket, object_key")
    .eq("id", assetId)
    .maybeSingle();

  if (error || !asset?.bucket || !asset.object_key) {
    return null;
  }

  const { data } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_key, SIGNED_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
}
