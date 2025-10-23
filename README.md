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
- **Autopilot** – Pro users (including seeded demo profiles) now auto-reply through a Supabase trigger + edge function pipeline. Once a message lands in the database the edge function generates the partner’s reply—even if both clients are offline—with realistic typing delays.

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
  display_name text not null,
  age int not null check (age >= 18),
  gender text not null check (gender in ('woman', 'man', 'nonbinary', 'other')),
  gender_preference text not null default 'everyone'
    check (gender_preference in ('women', 'men', 'everyone')),
  height_cm int,
  ethnicity text,
  bio text,
  persona_seed text,
  prompts jsonb not null default '[]',
  hobbies text[] not null default '{}',
  photo_urls text[] not null,
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_photo_count check (cardinality(photo_urls) between 4 and 6)
);

create table seed_profiles (
  seed_id text primary key,
  display_name text not null,
  age int,
  gender text not null default 'other'
    check (gender in ('woman', 'man', 'nonbinary', 'other')),
  gender_preference text not null default 'everyone'
    check (gender_preference in ('women', 'men', 'everyone')),
  height_cm int,
  ethnicity text,
  bio text,
  persona_seed text,
  prompts jsonb not null default '[]',
  hobbies text[] not null default '{}',
  photo_urls text[] not null,
  is_active boolean not null default true,
  constraint seed_profiles_photo_count check (cardinality(photo_urls) between 4 and 6)
);

create table dismissed_seeds (
  user_id uuid references auth.users on delete cascade,
  seed_id text references seed_profiles(seed_id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, seed_id)
);

create table dismissed_profiles (
  user_id uuid references auth.users on delete cascade,
  target_user_id uuid references auth.users on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, target_user_id)
);

create table message_read_receipts (
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references auth.users on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index message_read_receipts_match_idx on message_read_receipts (match_id, user_id);

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

alter table dismissed_profiles enable row level security;
create policy "owner dismissed profile read" on dismissed_profiles
  for select using (auth.uid() = user_id);
create policy "owner dismissed profile write" on dismissed_profiles
  for insert with check (auth.uid() = user_id);

alter table message_read_receipts enable row level security;
create policy "participant read receipts read" on message_read_receipts
  for select using (auth.uid() = user_id);
create policy "participant read receipts write" on message_read_receipts
  for insert with check (auth.uid() = user_id);
create policy "participant read receipts update" on message_read_receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table matches enable row level security;
create policy "participant read" on matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "owner create seed match" on matches
  for insert with check (auth.uid() = user_a);
create policy "participant update match" on matches
  for update using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

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
      where m.id = messages.match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid()))
  );

create or replace function fetch_match_summaries(viewer_id uuid)
returns table (
  id uuid,
  user_a uuid,
  user_b uuid,
  seed_id text,
  autopilot_enabled boolean,
  status match_status,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  last_message_created_at timestamptz,
  last_message_sender uuid,
  last_message_is_seed boolean,
  unread_count int
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    m.user_a,
    m.user_b,
    m.seed_id,
    m.autopilot_enabled,
    m.status,
    m.created_at,
    m.updated_at,
    lm.id as last_message_id,
    lm.text as last_message_text,
    lm.created_at as last_message_at,
    lm.created_at as last_message_created_at,
    lm.sender_id as last_message_sender,
    lm.is_seed as last_message_is_seed,
    coalesce(unread.unread_count, 0)::int as unread_count
  from matches m
  left join lateral (
    select msg.id, msg.text, msg.created_at, msg.sender_id, msg.is_seed
    from messages msg
    where msg.match_id = m.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::bigint as unread_count
    from messages msg
    left join message_read_receipts r
      on r.match_id = msg.match_id and r.user_id = viewer_id
    where msg.match_id = m.id
      and msg.sender_id is distinct from viewer_id
      and (r.last_read_at is null or msg.created_at > r.last_read_at)
  ) unread on true
  where viewer_id is not null
    and (m.user_a = viewer_id or m.user_b = viewer_id)
  order by coalesce(lm.created_at, m.created_at) desc;
$$;

grant execute on function fetch_match_summaries(uuid) to authenticated;
```

Seed a few demo profiles (edit as desired):

```sql
insert into seed_profiles (
  seed_id,
  display_name,
  age,
  gender,
  gender_preference,
  height_cm,
  ethnicity,
  bio,
  persona_seed,
  prompts,
  hobbies,
  photo_urls,
  is_active
)
values
  (
    'seed_ivy',
    'Ivy',
    24,
    'woman',
    'men',
    167,
    'Filipina',
    'Plant mom, weekend climber, noodle soup evangelist.',
    'Bright, warm, outdoorsy; playful plant analogies.',
    '[{"question": "Ideal first date?", "answer": "Coffee in a sunny greenhouse"}]',
    '{Climbing,Cooking,Houseplants}',
    array[
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/ivy-1.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/ivy-2.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/ivy-3.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/ivy-4.jpg'
    ],
    true
  ),
  (
    'seed_kai',
    'Kai',
    27,
    'man',
    'women',
    181,
    'Japanese American',
    'Triathlete, ramen aficionado, part-time synth nerd.',
    'Energetic, encouraging, short confident banter.',
    '[{"question": "Perfect weekend?", "answer": "Morning swim, night market"}]',
    '{Triathlon,Music,Street food}',
    array[
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/kai-1.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/kai-2.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/kai-3.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/kai-4.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/kai-5.jpg'
    ],
    true
  ),
  (
    'seed_lena',
    'Lena',
    25,
    'woman',
    'everyone',
    170,
    'Latina',
    'Design grad, gallery hopper, rainy city walks.',
    'Soft wit, art references, curious about simple joys.',
    '[{"question": "Comfort show?", "answer": "Bob''s Burgers"}]',
    '{Art,Coffee,Photography}',
    array[
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/lena-1.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/lena-2.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/lena-3.jpg',
      'https://<project>.supabase.co/storage/v1/object/public/profile-photos/seeds/lena-4.jpg'
    ],
    true
  )
on conflict (seed_id) do update set
  display_name = excluded.display_name,
  age = excluded.age,
  gender = excluded.gender,
  gender_preference = excluded.gender_preference,
  height_cm = excluded.height_cm,
  ethnicity = excluded.ethnicity,
  bio = excluded.bio,
  persona_seed = excluded.persona_seed,
  prompts = excluded.prompts,
  hobbies = excluded.hobbies,
  photo_urls = excluded.photo_urls,
  is_active = true;

> 📸 **Storage** – Create a public Supabase Storage bucket named `profile-photos` and upload the seed images (and any human profile
> photos) there. The URLs above assume the files live in `profile-photos/seeds/*`. Grant `public` read access so the Expo app can
> fetch the images without an authenticated storage token.
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
- The edge function uses the service role key and OpenAI key; make sure those values are set when you deploy to production.
- Set the dev feature flags to `true` when you want quick-reset tooling (e.g., resetting the seed deck from Discover even when it is not empty).
- The Vercel function uses the service-role key **only** on the server to read/write messages and verify JWTs.

---

## Background Autopilot

Autopilot is now handled entirely inside Supabase. The control flow looks like this:

```
INSERT INTO messages
        ↓
Postgres trigger → Edge Function (`autopilot-handler`)
        ↓
Edge function checks the recipient’s Pro/autopilot status, generates a reply with OpenAI, waits 1–5 seconds, and inserts it.
        ↓
The new reply fires the trigger again—if the other participant has autopilot enabled, the process repeats.
```

### Setup Checklist

1. **Deploy the edge function**
   ```bash
   supabase functions deploy autopilot-handler \
     --project-ref <your-project-ref>
   ```
   Source lives in `supabase/functions/autopilot-handler`.

2. **Expose the edge-function secret to Postgres**
   ```sql
   -- run once in the SQL editor (replace with your edge function anon key)
   SELECT set_config('app.edge_function_secret', 'SUPABASE_EDGE_FUNCTION_ANON_KEY', true);
   ```

3. **Install the trigger**
   Run the SQL in `supabase/db/autopilot_trigger.sql`. Before executing, replace the placeholder URL with your project’s `functions.v1` endpoint.

4. **Ensure `pg_net` is enabled**
   ```sql
   CREATE EXTENSION IF NOT EXISTS "pg_net";
   ```

5. **Environment variables**
   - Edge function expects `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Vercel/server continue to use those values for the draft/autopilot endpoints.

The mobile client now listens on a realtime channel for `messages` inserts, so replies added by the edge function appear instantly along with typing indicators.

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
   - Build your profile (name, age ≥ 18, gender, preference, 4–6 hosted photos) then head to Discover, Like a seed, open the chat.
   - Enable “Wingmate Autopilot” in Profile to unlock auto-drafted openers and follow ups.

> Note: `npm install` cannot run in this environment because outbound network calls are blocked. Install dependencies on your machine before running `tsc`/`expo`.

---

## Deployment Checklist

1. **Supabase**
   - Apply the schema & policies above.
   - Add seed data (or build an admin UI).
   - Create a **public** storage bucket named `profile-photos` and upload at least 4 images per seed (and any onboarding defaults).
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
- Discover stays locked until the profile validator confirms name, age, gender, preference, and 4–6 hosted photos are set (uploads stream through the `profile-photos` bucket).
- Matches & chat screens hydrate from Supabase, including autopilot toggles, message polling, unread counters backed by `message_read_receipts`, and Pro gating.
- Added onboarding instructions + schema SQL to this README for quick reprovisioning.

---

## Troubleshooting

- **Missing tables / RLS failures** – double-check the SQL and that the logged-in user has the correct UUID in `auth.users`.
- **403 on `/api/chat`** – client must send the Supabase access token; ensure the Expo session is active and `.auth.getSession()` succeeded.
- **Empty autopilot replies** – function returns the fallback text when OpenAI or Supabase fails; check Vercel logs.
- **Expo can’t reach backend** – use your LAN IP in `EXPO_PUBLIC_BASE_URL` and ensure port 3000 is open.

Enjoy iterating—Wingmate now has a real backend foundation without sacrificing the original simplicity.
