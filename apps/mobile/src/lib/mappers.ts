import type { Profile, SeedProfile } from "./types";

export const mapSeedProfile = (row: any): SeedProfile => ({
  isSeed: true,
  isPro: true,
  seedId: row.seed_id,
  userId: row.seed_id,
  name: row.display_name ?? "Mystery",
  age: row.age ?? undefined,
  bio: row.bio ?? "",
  prompts: row.prompts ?? [],
  hobbies: row.hobbies ?? [],
  photoURIs: row.photo_url ? [row.photo_url] : [],
  personaSeed: row.persona_seed ?? "Playful and curious.",
});

export const mapProfileRow = (row: any): Profile => ({
  userId: row.id,
  name: row.display_name ?? "",
  age: row.age ?? undefined,
  bio: row.bio ?? "",
  personaSeed: row.persona_seed ?? "Friendly and curious.",
  prompts: row.prompts ?? [],
  hobbies: row.hobbies ?? [],
  photoURIs: row.photo_urls ?? [],
  isPro: row.is_pro ?? false,
});
