export type User = {
  id: string;
  email: string;
};

export type ProfilePrompt = {
  question: string;
  answer: string;
};

export type Profile = {
  userId: string;
  name: string;
  age?: number;
  bio: string;
  prompts: ProfilePrompt[];
  hobbies: string[];
  photoURIs: string[];
  personaSeed: string;
  isPro: boolean;
};

export type SeedProfile = Profile & {
  isSeed: true;
  isPro: true;
  seedId: string;
};

export type Match = {
  id: string;
  userA: string;
  userB: string;
  createdAt: number;
  active: boolean;
  autopilot?: boolean;
  seedId?: string | null;
};

export type Message = {
  id: string;
  matchId: string;
  fromUserId?: string;
  fromAI?: boolean;
  text: string;
  createdAt: number;
};
