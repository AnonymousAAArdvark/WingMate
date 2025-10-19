# Wingmate — Minimal-Headache AI Dating App (Prototype)

A mobile-first prototype built with Expo/React Native and a single serverless function for LLM replies. The front end owns app state (AsyncStorage + Zustand) to minimize moving parts and speed iteration.

## Features
- Sign up / sign in (prototype credentials stored locally)
- Create a profile (name, bio, prompts, hobbies, photos via device picker)
- Discover three seeded profiles (always “Pro”, reply via AI)
- Match and chat; AI replies for seeds using one stateless serverless endpoint
- Pro stub: “Wingmate Autopilot”
  - In Profile: toggle Pro stub (isPro)
  - In Chat: Pro users can auto-draft an opener; optional Autopilot can continue replies automatically

## Tech Stack
- Mobile: React Native + Expo (TypeScript), `expo-router`
- State: Zustand + AsyncStorage
- Styling: React Native `StyleSheet`
- Backend: Vercel Serverless Function (TypeScript)
- LLM: OpenAI (default `gpt-4o-mini`)
- Images: Device photo picker (`expo-image-picker`) for local URIs

## Repository Structure
```
Wingmate/
  CODEX_INSTRUCTIONS.md          # Original spec
  README.md                      # This file
  server/
    api/chat.ts                  # Vercel serverless handler for AI replies
    package.json
    tsconfig.json
    vercel.json                  # Routes / build config for Vercel
    .env.local                   # OPENAI_API_KEY (local dev)
  apps/
    mobile/
      app/                       # expo-router routes
        (auth)/                  # Auth screens
          sign-in.tsx
          sign-up.tsx
        (tabs)/                  # Main tabs
          _layout.tsx
          discover.tsx           # Swipe deck + Reset deck
          matches.tsx            # Match list
          profile.tsx            # Profile editor + Pro/Autopilot toggle
        chat/
          [matchId].tsx          # Chat UI + Autopilot controls
        _layout.tsx              # Root stack, hydration
        index.tsx                # Auth redirector
      src/
        components/
          ChatBubble.tsx         # Simple bubbles, AI badge removed
          HobbyChips.tsx
          ProfileCard.tsx        # Seed card component
          PromptList.tsx
        lib/
          api.ts                 # Client for /api/chat
          seeds.ts               # Three seeded profiles
          types.ts               # Shared front-end types
        store/
          useAuth.ts             # Auth + isPro (Pro stub)
          useMatches.ts          # Matches + messages
          useProfile.ts          # User profile
      app.config.ts              # Expo config & plugins (router, image-picker)
      package.json
      tsconfig.json
      .env                       # EXPO_PUBLIC_BASE_URL for mobile
```

## Data Model (front-end only)
Types are in `apps/mobile/src/lib/types.ts`.
- `User`: `{ id, username, password, isPro }`
- `Profile`: `{ userId, name, bio, prompts[{q,a}], hobbies[], photoURIs[], personaSeed }`
- `SeedProfile`: `Profile` + `{ isSeed: true, isPro: true, seedId }`
- `Match`: `{ id, userA, userB, createdAt, active }`
- `Message`: `{ id, matchId, fromUserId?, fromAI?, text, createdAt }`

## State + Storage
- AsyncStorage keys (per user):
  - `auth` (current session)
  - `profile_<userId>` (profile)
  - `matches_<userId>` (array of matches)
  - `messages_<userId>` (map of `matchId -> messages[]`)
- Discover deck cache:
  - `wingmate_dismissed_seeds_v1` (list of seedIds the user already swiped)
- Zustand stores in `apps/mobile/src/store/`

## App Flows
- Auth: enter any username/password → session saved under `auth`
- Discover:
  - Swipe or use Pass/Like. Cards are fixed-width and stack with a small vertical offset.
  - “Reset deck” appears only when the deck is empty and clears dismissed seeds (and optionally matches/messages) to repopulate.
- Matches: lists your matches (name + last message preview), tap to enter chat
- Chat:
  - For seed chats, messages from the seed are AI-generated via the backend
  - Composer at bottom; safe-area + keyboard handling
  - Pro/Autopilot:
    - Profile → Wingmate Autopilot (Pro stub toggle)
    - Chat header: “Start a message” drafts an opener as you
    - Optional Autopilot continues replies automatically after seed messages

## LLM Backend
- Endpoint: `POST /api/chat` (see `server/api/chat.ts`)
- Environment:
  - `OPENAI_API_KEY` (required) in `server/.env.local` for dev, or Vercel Project env for prod
  - `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
- Request:
```
{
  seedId: string,
  seedName: string,
  personaSeed: string,
  lastMessages: { from: "user" | "seed", text: string }[],
  userMessage: string,
  preferDateSetup?: boolean
}
```
- How it works:
  - Builds a concise system prompt (tone, goals, short answers; propose simple plan if `preferDateSetup`)
  - Maps `lastMessages` to OpenAI roles (user/assistant)
  - Calls Chat Completions; returns `{ reply }`
  - On error (rate limit, network): returns a safe fallback (“That sounds fun—want to pick a time?”)

## Running Locally
Prereqs
- Node 20 LTS
- Vercel & Expo CLIs via `npx`

Server
- `cd server && npm install`
- `server/.env.local`:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```
- Start: `npx vercel dev --yes` → `http://localhost:3000`

Mobile
- `cd apps/mobile && npm install`
- Set `.env`:
  - Simulators: `EXPO_PUBLIC_BASE_URL="http://localhost:3000"`
  - Real device: `EXPO_PUBLIC_BASE_URL="http://<laptop-ip>:3000"` (e.g. `http://10.0.0.96:3000`)
- Start: `npx expo start -c` (scan the QR)

Test
1) Sign up → create profile
2) Discover → swipe or like → match
3) Chat → send a message to a seed → AI replies
4) Profile → enable Wingmate Autopilot (Pro stub)
5) Chat → use “Start a message” and optionally toggle Autopilot to continue

## Troubleshooting
- Expo device cannot reach localhost: use your laptop’s LAN IP in `EXPO_PUBLIC_BASE_URL`.
- Ports & cache: restart with `npx expo start -c`.
- OpenAI `429` quota: the server falls back to a safe reply; add credits to test AI fully.
- Reset deck: swipe through all, then tap “Reset deck” to repopulate; or clear AsyncStorage.

## Production
- Server: `npx vercel --prod` and set `OPENAI_API_KEY` in Vercel Project
- Mobile: set `EXPO_PUBLIC_BASE_URL` to your deployed URL

## Extending
- Add seeds in `apps/mobile/src/lib/seeds.ts`
- Tune personas via profile `personaSeed` or `server/api/chat.ts` system prompt
- Replace Pro stub with Stripe, add persistence (Supabase/Firebase), push, etc.

