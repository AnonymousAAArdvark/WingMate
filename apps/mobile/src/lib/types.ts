export type User = {
  id: string;
  email: string;
};

export type ProfilePrompt = {
  question: string;
  answer: string;
};

export type Gender = "woman" | "man" | "nonbinary" | "other";

export type GenderPreference = "women" | "men" | "everyone";

export type Profile = {
  userId: string;
  name: string;
  age?: number;
  bio: string;
  prompts: ProfilePrompt[];
  hobbies: string[];
  photoURIs: string[];
  personaSeed: string;
  gender: Gender;
  genderPreference: GenderPreference;
  heightCm?: number;
  ethnicity?: string;
  isPro: boolean;
};

export type SeedProfile = Profile & {
  isSeed: true;
  isPro: true;
  seedId: string;
};

export type DiscoverProfile =
  | (SeedProfile & { kind: "seed"; id: string })
  | (Profile & { kind: "user"; id: string; isSeed?: false });

export type Match = {
  id: string;
  userA: string;
  userB: string;
  createdAt: number;
  active: boolean;
  autopilot?: boolean;
  seedId?: string | null;
  lastMessageAt?: number;
  lastMessageText?: string;
  lastMessageSenderId?: string | null;
  lastMessageFromAI?: boolean;
  unreadCount: number;
};

export type Message = {
  id: string;
  matchId: string;
  fromUserId?: string;
  fromAI?: boolean;
  text: string;
  createdAt: number;
};
