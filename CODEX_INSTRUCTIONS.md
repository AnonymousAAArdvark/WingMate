# 💘 Wingmate — Minimal-Headache AI Dating App (Prototype)

> Instruction file for **GPT-5 Codex** (and humans) to generate a **one-shot, clean, working prototype** emphasizing **simplicity**, **efficiency**, and **very low bug surface**.

This spec yields a mobile app that:
- lets users **sign up / sign in** (super simple),
- **create a profile** (photos, bio, prompts, hobbies),
- **browse 3 seeded profiles**, **match**, and **chat**,
- includes a **Pro Plan**: an **AI persona** that auto-replies and can propose dates,
- uses a **single serverless endpoint** for LLM replies,
- has a **dev vs prod** split,
- intentionally avoids complex/fragile features to reduce failure points.

---

## 0) Principles

1. **Simplicity first** — minimal services, minimal edge cases.
2. **Single serverless endpoint** — no sockets, no stateful servers.
3. **Front-end owns state** (prototype) — stored locally via AsyncStorage.
4. **No secrets in app** — LLM key only on the serverless side.
5. **Clean UI** — basic layout that LLMs generate reliably.
6. **Fast iteration** — Expo hot reload + Vercel serverless deploy.

---

## 1) Tech Stack

- **Mobile:** React Native + **Expo** (TypeScript, `expo-router`)
- **State:** Zustand + AsyncStorage
- **Styling:** React Native `StyleSheet` (simplest & robust)
- **Backend:** **Vercel Serverless Function** (Node/TS)
- **LLM:** OpenAI (default `gpt-4o-mini`)
- **Images:** Placeholder URLs or device library (no external storage)
- **Payments:** UI stub only (no provider wired yet)
- **Envs:** `.env.local` (server dev) + Vercel Prod env; `EXPO_PUBLIC_BASE_URL` in app

---

## 2) Architecture (ASCII)

```
[ Expo App ]  -- HTTPS -->  [ /api/chat (Vercel) ]  -->  [ OpenAI Chat Completions ]
    |
    v
[ AsyncStorage ]
- auth (userId, isPro)
- profile (bio, prompts, hobbies, photos)
- matches & messages (incl. 3 seeded "remote" profiles with Pro)
```

- **Stateless** backend: client sends small context each time.
- App state is local for the prototype (keeps things simple).

---

## 3) Scope

### Included
- **Auth (prototype):** username + password (stored locally); no validation beyond basics.
- **Profile:** name, age (opt), bio, 2–3 prompts, hobbies, photos (URLs or picked).
- **Discover:** 3 **seeded** test profiles, each marked **Pro** (AI auto-replies).
- **Match & Chat:** Like → create match → chat. AI replies for seeded profiles.
- **Pro Plan (stub):** toggle in Profile (no real payments).

### Excluded (on purpose)
- Location filters, email/phone verification, real payments, moderation queue, push notifications, web app, real DB.

---

## 4) Data Models (front-end only)

```ts
// types.ts
export type User = {
  id: string;
  username: string;
  password?: string; // prototype only
  isPro: boolean;
};

export type Profile = {
  userId: string;
  name: string;
  age?: number;
  bio: string;
  prompts: { question: string; answer: string }[];
  hobbies: string[];
  photoURIs: string[];     // local URIs or https placeholders
  personaSeed: string;     // 1–2 sentence style summary for LLM
};

export type SeedProfile = Profile & {
  isSeed: true;
  isPro: true;             // always Pro so AI replies
  seedId: string;          // fixed id for tests
};

export type Match = {
  id: string;
  userA: string;           // current user id
  userB: string;           // seed or other user id
  createdAt: number;
  active: boolean;
};

export type Message = {
  id: string;
  matchId: string;
  fromUserId?: string;     // omitted if from AI (seed)
  fromAI?: boolean;        // true for AI replies
  text: string;
  createdAt: number;
};
```

---

## 5) LLM Prompting (backend)

**System template:**
```
You are {seedName}, role-playing naturally in a dating chat.
PERSONA: {personaSeed}
GOALS:
- Be warm and concise (<= 2 short sentences).
- Ask light questions to keep chat going.
- If meeting is hinted or preferDateSetup=true, propose a simple coffee/walk plan with day/time.
STYLE:
- Casual texting tone; avoid over-formality or links.
SAFETY:
- Avoid requesting sensitive data or sending links.

CONTEXT:
{last_k_messages (<= 8)}
```

- `preferDateSetup=true` nudges a one-sentence venue/time suggestion.

---

## 6) API Contract

### `POST /api/chat`
**Request:**
```json
{
  "seedId": "seed_anna",
  "seedName": "Anna",
  "personaSeed": "Playful, outdoorsy, likes indie films.",
  "lastMessages": [
    {"from": "user", "text": "hey anna! hike this weekend?"},
    {"from": "seed", "text": "that sounds fun—what day works?"}
  ],
  "userMessage": "saturday afternoon?",
  "preferDateSetup": true
}
```

**Response:**
```json
{ "reply": "Saturday afternoon works—meet at the Arb around 3?" }
```

- Stateless; the client supplies minimal context each turn.

---

## 7) Environments

- **Dev**
  - Server: `server/.env.local` → `OPENAI_API_KEY=...`
  - Mobile: `apps/mobile/.env` → `EXPO_PUBLIC_BASE_URL="http://localhost:3000"` (or your Vercel preview URL)
- **Prod**
  - Vercel Project → `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`)
  - Mobile: `EXPO_PUBLIC_BASE_URL="https://<your-vercel>.vercel.app"`

---

## 8) Seeded Test Profiles (3)

```ts
// seeds.ts
export const SEEDS: SeedProfile[] = [
  {
    isSeed: true, isPro: true, seedId: "seed_anna",
    userId: "seed_anna", name: "Anna", age: 24,
    bio: "Weekend hikes, ramen tours, and quiet bookstores.",
    prompts: [
      { question: "Ideal first date?", answer: "Walk + coffee, nothing fancy." },
      { question: "Most used emoji?", answer: "✨" }
    ],
    hobbies: ["Hiking","Cooking","Indie films"],
    photoURIs: ["https://picsum.photos/seed/anna1/800/1000"],
    personaSeed: "Playful, outdoorsy, likes indie films; short witty replies."
  },
  {
    isSeed: true, isPro: true, seedId: "seed_marcus",
    userId: "seed_marcus", name: "Marcus", age: 26,
    bio: "Gym, tacos, techno. Dog dad.",
    prompts: [
      { question: "Perfect weekend?", answer: "Lift, brunch, a show at night." },
      { question: "Hot take?", answer: "Pineapple on tacos > pizza." }
    ],
    hobbies: ["Fitness","Music","Foodie"],
    photoURIs: ["https://picsum.photos/seed/marcus1/800/1000"],
    personaSeed: "Confident, playful, direct; short cheeky banter."
  },
  {
    isSeed: true, isPro: true, seedId: "seed_sofia",
    userId: "seed_sofia", name: "Sofia", age: 25,
    bio: "Art student, latte snob, museum crawler.",
    prompts: [
      { question: "Go-to comfort show?", answer: "Fleabag." },
      { question: "Pet peeve?", answer: "Loud phone speakers in public." }
    ],
    hobbies: ["Art","Coffee","Museums"],
    photoURIs: ["https://picsum.photos/seed/sofia1/800/1000"],
    personaSeed: "Wry humor, artsy references, gentle curiosity."
  }
];
```

---

## 9) Screens & Components

**Tabs:** `Discover`, `Matches`, `Profile` + route `Chat/[matchId]`  
**Auth:** `SignIn`, `SignUp`

- **Discover:** list the **3 seeds** as cards with Like/Pass. Like → create match → navigate to Chat.
- **Matches:** simple list (name + last message).
- **Chat:** flat list; input + send; AI replies for seeds via `/api/chat`. AI messages get a tiny “AI” badge.
- **Profile:** edit profile (bio, prompts, hobbies, photos) + **Pro toggle** (stub).

**UI rules (LLM-friendly):**
- White background, 16px spacing, rounded images, 20px titles, 16px body.
- No complex animations; keep layout as stacked Views.
- Buttons: primary (Like), secondary (Pass).

---

## 10) Project Structure

```
wingmate/
  apps/
    mobile/
      app/
        (auth)/
          sign-in.tsx
          sign-up.tsx
        (tabs)/
          discover.tsx
          matches.tsx
          profile.tsx
        chat/
          [matchId].tsx
        _layout.tsx
      src/
        store/
          useAuth.ts
          useProfile.ts
          useMatches.ts
        components/
          ProfileCard.tsx
          ChatBubble.tsx
          HobbyChips.tsx
          PromptList.tsx
        lib/
          api.ts
          seeds.ts
          types.ts
      app.config.ts
      package.json
      tsconfig.json
      .env
  server/
    api/
      chat.ts
    package.json
    tsconfig.json
    vercel.json
    .env.local
```

---

## 11) Implementation Steps (Codex run-book)

### A) Scaffold

```sh
mkdir -p wingmate/apps/mobile wingmate/server
```

**Expo app (TS):**
```sh
cd wingmate/apps/mobile
npx create-expo-app@latest . --template
npm i expo-router zustand @react-native-async-storage/async-storage
npm i -D @types/react-native
```

**Vercel server:**
```sh
cd ../../server
npm init -y
npm i openai
npm i -D typescript @types/node
npx tsc --init
```

### B) Serverless `/api/chat.ts`

```ts
// server/api/chat.ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { seedName, personaSeed, lastMessages = [], userMessage, preferDateSetup } = req.body || {};

    const system = [
      `You are ${seedName}, role-playing naturally in a dating chat.`,
      `PERSONA: ${personaSeed}`,
      `GOALS: Be warm, concise (<= 2 short sentences). Ask light questions.`,
      `If meeting is hinted or preferDateSetup=true, propose a simple coffee/walk plan with day/time.`,
      `STYLE: Casual texting; no over-formality; no external links.`,
      `SAFETY: Do not request sensitive info.`
    ].join("\n");

    const msgs = [
      { role: "system", content: system },
      ...lastMessages.map((m: any) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
      { role: "user", content: userMessage }
    ];

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: msgs,
      temperature: 0.7,
      max_tokens: 80
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "That sounds fun—want to pick a time?";
    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    // Graceful fallback to avoid UI errors
    return res.status(200).json({ reply: "That sounds fun—want to pick a time?" });
  }
}
```

**vercel.json**
```json
{
  "version": 2,
  "builds": [{ "src": "api/chat.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/api/chat", "dest": "/api/chat.ts" }]
}
```

**.env.local**
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Deploy:
```sh
cd server
npx vercel --prod
```

### C) Mobile stores & API

**Auth store (`useAuth.ts`)**
```ts
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AuthState = {
  userId?: string;
  username?: string;
  isPro: boolean;
  signIn: (u: string, p: string) => Promise<void>;
  signUp: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  userId: undefined,
  username: undefined,
  isPro: false,
  signIn: async (u) => {
    const id = `u_${u}`;
    await AsyncStorage.setItem("auth", JSON.stringify({ userId: id, username: u, isPro: false }));
    set({ userId: id, username: u, isPro: false });
  },
  signUp: async (u) => {
    const id = `u_${u}`;
    await AsyncStorage.setItem("auth", JSON.stringify({ userId: id, username: u, isPro: false }));
    set({ userId: id, username: u, isPro: false });
  },
  signOut: async () => {
    await AsyncStorage.removeItem("auth");
    set({ userId: undefined, username: undefined, isPro: false });
  },
}));
```

**Profile store (`useProfile.ts`)**
```ts
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Profile } from "../lib/types";

type ProfileState = {
  profile?: Profile;
  load: (userId: string) => Promise<void>;
  save: (p: Profile) => Promise<void>;
};

export const useProfile = create<ProfileState>((set) => ({
  profile: undefined,
  load: async (userId) => {
    const raw = await AsyncStorage.getItem(`profile_${userId}`);
    set({ profile: raw ? JSON.parse(raw) : undefined });
  },
  save: async (p) => {
    await AsyncStorage.setItem(`profile_${p.userId}`, JSON.stringify(p));
    set({ profile: p });
  }
}));
```

**Matches/messages store (`useMatches.ts`)**
```ts
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Match, Message } from "../lib/types";
import { nanoid } from "nanoid/non-secure";

type MatchesState = {
  matches: Match[];
  messages: Record<string, Message[]>;
  load: (userId: string) => Promise<void>;
  likeSeed: (userId: string, seedUserId: string) => Promise<Match>;
  sendMessage: (matchId: string, text: string, fromAI?: boolean) => Promise<void>;
};

export const useMatches = create<MatchesState>((set, get) => ({
  matches: [],
  messages: {},
  load: async (userId) => {
    const m = await AsyncStorage.getItem(`matches_${userId}`);
    const ms = await AsyncStorage.getItem(`messages_${userId}`);
    set({ matches: m ? JSON.parse(m) : [], messages: ms ? JSON.parse(ms) : {} });
  },
  likeSeed: async (userId, seedUserId) => {
    const id = nanoid();
    const match: Match = { id, userA: userId, userB: seedUserId, createdAt: Date.now(), active: true };
    const state = get();
    const matches = [...state.matches, match];
    await AsyncStorage.setItem(`matches_${userId}`, JSON.stringify(matches));
    set({ matches });
    return match;
  },
  sendMessage: async (matchId, text, fromAI) => {
    const state = get();
    const arr = state.messages[matchId] || [];
    const msg: Message = { id: nanoid(), matchId, text, createdAt: Date.now(), fromAI, fromUserId: fromAI ? undefined : "me" };
    const next = { ...state.messages, [matchId]: [...arr, msg] };
    set({ messages: next });
    const authRaw = await AsyncStorage.getItem("auth");
    const auth = authRaw ? JSON.parse(authRaw) : null;
    if (auth?.userId) await AsyncStorage.setItem(`messages_${auth.userId}`, JSON.stringify(next));
  },
}));
```

**API client (`api.ts`)**
```ts
export const BASE_URL = process.env.EXPO_PUBLIC_BASE_URL || "http://localhost:3000";

export async function fetchAIReply(payload: {
  seedId: string; seedName: string; personaSeed: string;
  lastMessages: {from: "user"|"seed"; text: string}[];
  userMessage: string; preferDateSetup?: boolean;
}) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  return res.json() as Promise<{ reply: string }>;
}
```

---

## 12) Chat wiring (client)

When user sends a message:
1. Append user message locally via `useMatches.sendMessage(matchId, text)`.
2. If counterpart is one of the **3 seeds**:
   - Build `lastMessages` from prior chat (`fromAI` → `"seed"`, user messages → `"user"`, take last 8).
   - Call `fetchAIReply({ seedId, seedName, personaSeed, lastMessages, userMessage: text, preferDateSetup })`.
   - Append returned `reply` with `fromAI: true`.
3. On failure, append **fallback**: `"That sounds fun—want to pick a time?"`.

No spinners required for prototype; keep it instant and resilient.

---

## 13) Pro Plan (stub)

- **Profile screen**: simple “Upgrade to Pro” switch toggling `useAuth().isPro`.  
- No real payment; just gate any “auto-start conversation” feature behind `isPro`.  
- **Seed** profiles are **always Pro** and will always auto-reply.

---

## 14) Dev vs Prod

- **Dev**
  - `server/.env.local` → `OPENAI_API_KEY=...`
  - `apps/mobile/.env` → `EXPO_PUBLIC_BASE_URL="http://localhost:3000"` (or your Vercel preview)
- **Prod**
  - Set Vercel envs (`OPENAI_API_KEY`, `OPENAI_MODEL` optional).
  - `apps/mobile/.env` → `EXPO_PUBLIC_BASE_URL="https://<your-vercel>.vercel.app"`

---

## 15) Safety & Transparency

- Add an **“AI” badge** to messages where `fromAI=true`.
- Keep outputs short and neutral; no links, no sensitive requests.

---

## 16) Run & Test

**Server (local or prod):**
```sh
cd server
npx vercel dev      # local
# or
npx vercel --prod   # deploy
```

**Mobile:**
```sh
cd apps/mobile
npx expo start
```

**Test flow:**
1. Sign up (pick any username).
2. Create profile (bio, prompts, hobbies, photo URLs).
3. Discover → Like **Anna** → Match → Chat.
4. Send “hey anna! hike this weekend?” → expect AI reply (<=2 sentences).
5. Try “Suggest a date” (toggle `preferDateSetup`) → expect concise plan & time.

---

## 17) Future Upgrades

- Supabase/Firebase for real persistence & multi-device sync.
- Real payments (Stripe) for Pro.
- Media storage (Supabase Storage / UploadThing).
- Moderation pass on input/output.
- Streaming responses; push notifications.

---

## 18) Codex UI Prompts (safe templates)

**Discover screen (simple list of seed cards):**
> Create `discover.tsx` using React Native with `StyleSheet`. Map over `SEEDS` to render a large image card (rounded), name+age title, 2-line bio, hobbies chips, and “Pass” (secondary) / “Like” (primary) buttons. On Like, call `useMatches().likeSeed(auth.userId, profile.userId)` then navigate to `/chat/{matchId}`. Keep spacing 16, no animations.

**Chat screen:**
> Create `chat/[matchId].tsx` with a FlatList of messages. Right-aligned bubbles for user, left-aligned for partner; show a tiny “AI” badge on AI messages. Input at bottom; on send: append local message, then if partner is a seed, call `fetchAIReply(...)` and append the reply with `fromAI: true`. On error, append fallback.

**Profile screen:**
> Create a simple form: name, age(number), bio(multiline), prompts (2–3 Q/A rows), hobbies (comma-separated or chips), photo URL inputs (or device picker), and a “Pro (stub)” switch bound to `useAuth().isPro`. Save to AsyncStorage via `useProfile().save`.

---

## 19) Checklist

- [ ] Project structure created as above
- [ ] `/api/chat.ts` implemented; `vercel.json` added; `.env.local` set
- [ ] `seeds.ts`, `types.ts` added
- [ ] Zustand stores: `useAuth`, `useProfile`, `useMatches`
- [ ] Screens: SignIn, SignUp, Discover, Matches, Chat/[id], Profile
- [ ] `fetchAIReply` wired; fallback reply on errors
- [ ] “AI” badge on AI bubbles
- [ ] Pro toggle (stub) in Profile
- [ ] Dev/Prod env set and smoke-tested with the 3 seeds

---

**Deliverable:** a working prototype with **clean UI**, **AI auto-replies** for 3 seeded profiles, **zero fragile features**, and **clear dev/prod** separation.
