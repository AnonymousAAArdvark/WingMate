import type { Profile } from "./types";

export type ProfileValidationResult = {
  isComplete: boolean;
  missing: string[];
  errors: string[];
};

const REQUIRED_PHOTO_MIN = 4;
const REQUIRED_PHOTO_MAX = 6;

export function validateProfile(profile: Profile): ProfileValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];

  if (!profile.name.trim()) {
    missing.push("name");
  }

  if (typeof profile.age !== "number" || Number.isNaN(profile.age)) {
    missing.push("age");
  } else if (profile.age < 18) {
    errors.push("age must be 18 or older");
  }

  if (!profile.gender) {
    missing.push("gender");
  }

  if (!profile.genderPreference) {
    missing.push("gender preference");
  }

  const photoCount = profile.photoURIs.length;
  if (photoCount < REQUIRED_PHOTO_MIN) {
    missing.push(`${REQUIRED_PHOTO_MIN} photos`);
  }
  if (photoCount > REQUIRED_PHOTO_MAX) {
    errors.push(`limit photos to ${REQUIRED_PHOTO_MAX}`);
  }

  return {
    isComplete: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}

export function formatProfileValidation(result: ProfileValidationResult): string {
  if (result.isComplete) return "";
  const parts: string[] = [];
  if (result.missing.length) {
    parts.push(`Missing ${result.missing.join(", ")}`);
  }
  if (result.errors.length) {
    parts.push(result.errors.join("; "));
  }
  return parts.join(". ");
}
