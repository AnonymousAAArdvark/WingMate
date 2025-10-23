import { supabase } from "./supabase";

const BUCKET_NAME = "profile-photos";

function deriveExtension(fileName?: string, fallback = "jpg") {
  if (!fileName) return fallback;
  const parts = fileName.split(".");
  const ext = parts[parts.length - 1]?.toLowerCase();
  return ext || fallback;
}

function inferMimeType(extension: string, provided?: string) {
  if (provided) return provided;
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

export async function uploadProfilePhoto({
  userId,
  uri,
  fileName,
  mimeType,
}: {
  userId: string;
  uri: string;
  fileName?: string;
  mimeType?: string | null;
}): Promise<{ publicUrl: string; path: string }>
{
  const extension = deriveExtension(fileName ?? undefined);
  const safeMimeType = inferMimeType(extension, mimeType ?? undefined);
  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Unable to read photo from device storage.");
  }
  const arrayBuffer = await response.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);

  const { error } = await supabase.storage.from(BUCKET_NAME).upload(key, fileBytes, {
    cacheControl: "3600",
    contentType: safeMimeType,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(key);
  if (!data?.publicUrl) {
    throw new Error("Could not create a public photo URL.");
  }

  return { publicUrl: data.publicUrl, path: key };
}
