# Wingmate — Supabase-Backed AI Wingman

Wingmate is now a fully hosted prototype: the Expo app persists every profile, match, and message in Supabase, while a hardened Vercel serverless function drives OpenAI conversations. The goal is the same—ship a lightweight dating assistant—but with real backend durability and room for ~100 concurrent chatters.

---

## Architecture Overview

```
[Expo / React Native] ── HTTPS ──▶ [/api/chat (Vercel)] ──▶ [OpenAI]
         │                               │
         └───────── Supabase JS ─────────┘
                          │
                    [Postgres + RLS]
```

- **Mobile (apps/mobile)** – Expo + TypeScript, Zustand for client cache, Supabase client with persisted sessions.
- **Backend (server)** – Vercel Function `api/chat.ts` reads/writes Supabase and calls OpenAI (GPT-4o-mini by default).
- **Supabase** – Stores `profiles`, `seed_profiles`, `matches`, `messages`, and `dismissed_seeds`, with row-level security so each user only touches their rows.
- **Autopilot** – Pro users can auto-draft openers and follow-ups via an `autopilotDraft` mode on the same `/api/chat` endpoint (no local secrets in the app). When Autopilot is enabled on a match, the backend now continues conversations even if the app is closed or the user is logged out.

---

## Repository Layout

```
Wingmate/
  CODEX_INSTRUCTIONS.md      # Original project spec
  README.md                  # This document
  server/
    api/chat.ts              # Chat + autopilot handler (OpenAI + Supabase)
    lib/supabase.ts          # Server-side client using service role key
    types/database.ts        # Lightweight row typings
    package.json
    tsconfig.json
    vercel.json
  apps/
    mobile/
      app/                   # expo-router routes (auth, tabs, chat)
      src/
        components/          # UI atoms (ProfileCard, ChatBubble, etc.)
        lib/
          api.ts             # REST wrappers for /api/chat
          mappers.ts         # Supabase row -> app model helpers
          supabase.ts        # Client configured with AsyncStorage session
          types.ts           # Shared app models (Profile, Match, Message)
        store/
          useAuth.ts         # Supabase auth + session listener
          useMatches.ts      # Matches/messages synced with Supabase
          useProfile.ts      # Profile CRUD + Pro flag toggle
      app.config.ts          # Expo config (router, image-picker)
      package.json
      tsconfig.json
      .env                   # EXPO_PUBLIC_* runtime vars
```

---

## Supabase Schema

Create the tables once inside the SQL editor. All timestamps default to `now()`; Postgres 14+ is assumed.

```sql
-- Optional helper
create extension if not exists "pgcrypto";
create type match_status as enum ('active', 'ended');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  age int,
  bio text,
  persona_seed text,
  prompts jsonb not null default '[]',
  hobbies text[] not null default '{}',
  photo_urls text[] not null default '{}',
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table seed_profiles (
  seed_id text primary key,
  display_name text not null,
  age int,
  bio text,
  persona_seed text,
  prompts jsonb not null default '[]',
  hobbies text[] not null default '{}',
  photo_url text,
  is_active boolean not null default true
);

create table dismissed_seeds (
  user_id uuid references auth.users on delete cascade,
  seed_id text references seed_profiles(seed_id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, seed_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid references auth.users on delete cascade,
  seed_id text references seed_profiles(seed_id),
  status match_status not null default 'active',
  autopilot_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_user_a_idx on matches (user_a);
create index matches_seed_idx on matches (seed_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  sender_id uuid references auth.users on delete cascade,
  is_seed boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);
create index messages_match_idx on messages (match_id, created_at);
```

**Row Level Security policies** (enable RLS on every table):

```sql
alter table profiles enable row level security;
create policy "public profile read" on profiles
  for select using (true);
create policy "owner profile write" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

alter table seed_profiles enable row level security;
create policy "anyone can read seeds" on seed_profiles
  for select using (is_active);

alter table dismissed_seeds enable row level security;
create policy "owner dismissed read" on dismissed_seeds
  for select using (auth.uid() = user_id);
create policy "owner dismissed write" on dismissed_seeds
  for insert with check (auth.uid() = user_id);

alter table matches enable row level security;
create policy "participant read" on matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "owner create seed match" on matches
  for insert with check (auth.uid() = user_a);
create policy "owner update match" on matches
  for update using (auth.uid() = user_a);

alter table messages enable row level security;
create policy "participant read messages" on messages
  for select using (
    exists (select 1 from matches m
      where m.id = messages.match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid()))
  );
create policy "participant write messages" on messages
  for insert with check (
    sender_id = auth.uid() and
    exists (select 1 from matches m
      where m.id = messages.match_id and m.user_a = auth.uid())
  );
```

Seed a few demo profiles (edit as desired):

```sql
insert into seed_profiles (seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_url)
values
  ('seed_ivy',  'Ivy', 24, 'Plant mom, weekend climber, noodle soup evangelist.',
    'Bright, warm, outdoorsy; playful plant analogies.',
    '[{"question": "Ideal first date?", "answer": "Coffee in a sunny greenhouse"}]',
    '{Climbing,Cooking,Houseplants}', 'https://picsum.photos/seed/ivy1/800/1000'),
  ('seed_kai',  'Kai', 27, 'Triathlete, ramen aficionado, part-time synth nerd.',
    'Energetic, encouraging, short confident banter.',
    '[{"question": "Perfect weekend?", "answer": "Morning swim, night market"}]',
    '{Triathlon,Music,Street food}', 'https://picsum.photos/seed/kai1/800/1000'),
  ('seed_lena', 'Lena',25, 'Design grad, gallery hopper, rainy city walks.',
    'Soft wit, art references, curious about simple joys.',
    '[{"question": "Comfort show?", "answer": "Bob''s Burgers"}]',
    '{Art,Coffee,Photography}', 'https://picsum.photos/seed/lena1/800/1000')
  on conflict (seed_id) do update set
    display_name = excluded.display_name,
    age = excluded.age,
    bio = excluded.bio,
    persona_seed = excluded.persona_seed,
    prompts = excluded.prompts,
    hobbies = excluded.hobbies,
    photo_url = excluded.photo_url,
    is_active = true;
```

> ❗️ Supabase Auth: disable "Email Confirmations" for password sign-ups (Authentication → Providers → Email) or users will have to verify before receiving a session.

---

## Environment Configuration

### `server/.env.local`
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key
DEV_FEATURES_ENABLED=true
```

### `apps/mobile/.env`
```
EXPO_PUBLIC_BASE_URL="http://localhost:3000"          # or deployed Vercel URL
EXPO_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="public-anon-key"
EXPO_PUBLIC_DEV_FEATURES="true"
```

- The Expo client uses the anon key and persists sessions in AsyncStorage.
- Set the dev feature flags to `true` when you want quick-reset tooling (e.g., resetting the seed deck from Discover even when it is not empty).
- The Vercel function uses the service-role key **only** on the server to read/write messages and verify JWTs.

---

## Local Development

1. **Install dependencies** (requires internet access):
   ```bash
   cd server && npm install
   cd ../apps/mobile && npm install
   ```
2. **Run the backend** (localhost:3000):
   ```bash
   cd server
   npx vercel dev --yes
   ```
3. **Run the Expo app**:
   ```bash
   cd ../apps/mobile
   npx expo start -c
   ```
   - Simulators can keep `EXPO_PUBLIC_BASE_URL=http://localhost:3000`.
   - On a device, replace `localhost` with your LAN IP.

4. **Test flow**
   - Sign up with an email + password → profile row is upserted automatically.
   - Build your profile, then head to Discover, Like a seed, open the chat.
   - Enable “Wingmate Autopilot” in Profile to unlock auto-drafted openers and follow ups.

> Note: `npm install` cannot run in this environment because outbound network calls are blocked. Install dependencies on your machine before running `tsc`/`expo`.

---

## Deployment Checklist

1. **Supabase**
   - Apply the schema & policies above.
   - Add seed data (or build an admin UI).
2. **Vercel**
   - Set project env vars `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Deploy with `npx vercel --prod`.
3. **Expo / EAS**
   - Point `EXPO_PUBLIC_BASE_URL` to the deployed Vercel URL.
   - Supply the Supabase anon URL/key in `.env` or via `app.config.ts`.

---

## Implementation Notes & Changes

- Replaced local AsyncStorage persistence with Supabase tables for auth, profiles, matches, messages, and dismissed decks.
- Added shared Supabase clients (`server/lib/supabase.ts`, `apps/mobile/src/lib/supabase.ts`) and mapping helpers.
- Hardened `/api/chat`:
  - Validates Supabase JWTs, loads conversation history, injects persona details, inserts AI replies server-side.
  - Added `autopilotDraft` mode for Pro users to get message drafts without mutating the conversation.
- Refactored Zustand stores to hydrate from Supabase (`useAuth`, `useProfile`, `useMatches`).
- Discover deck now queries live seed profiles, persists dismissals/matches, and performs a remote “Reset deck”.
- Matches & chat screens hydrate from Supabase, including autopilot toggles, message polling, and Pro gating.
- Added onboarding instructions + schema SQL to this README for quick reprovisioning.

---

## Troubleshooting

- **Missing tables / RLS failures** – double-check the SQL and that the logged-in user has the correct UUID in `auth.users`.
- **403 on `/api/chat`** – client must send the Supabase access token; ensure the Expo session is active and `.auth.getSession()` succeeded.
- **Empty autopilot replies** – function returns the fallback text when OpenAI or Supabase fails; check Vercel logs.
- **Expo can’t reach backend** – use your LAN IP in `EXPO_PUBLIC_BASE_URL` and ensure port 3000 is open.

Enjoy iterating—Wingmate now has a real backend foundation without sacrificing the original simplicity.
