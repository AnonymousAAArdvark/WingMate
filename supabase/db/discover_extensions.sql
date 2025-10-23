-- Profile + matches helpers for Wingmate discover & messaging flows

-- Enforce profile completeness requirements (gender, preferences, and hosted photos)
alter table profiles
  add column if not exists gender text;
alter table profiles
  add column if not exists gender_preference text;
alter table profiles
  add column if not exists height_cm int;
alter table profiles
  add column if not exists ethnicity text;

update profiles
  set gender = coalesce(nullif(gender, ''), 'other')
  where gender is null;
update profiles
  set gender_preference = coalesce(nullif(gender_preference, ''), 'everyone')
  where gender_preference is null;
update profiles
  set age = case when age is null then 18 else age end
  where age is null;
update profiles
  set photo_urls = coalesce(photo_urls, '{}'::text[])
  where photo_urls is null;
update profiles
  set photo_urls = photo_urls[1:6]
  where cardinality(photo_urls) > 6;

alter table profiles alter column gender set not null;
alter table profiles alter column gender_preference set not null;
alter table profiles alter column age set not null;
alter table profiles alter column photo_urls set not null;

alter table profiles drop constraint if exists profiles_gender_check;
alter table profiles
  add constraint profiles_gender_check
  check (gender in ('woman', 'man', 'nonbinary', 'other'));

alter table profiles drop constraint if exists profiles_gender_preference_check;
alter table profiles
  add constraint profiles_gender_preference_check
  check (gender_preference in ('women', 'men', 'everyone'));

alter table profiles drop constraint if exists profiles_age_check;
alter table profiles
  add constraint profiles_age_check
  check (age >= 18);

alter table profiles drop constraint if exists profiles_photo_count_check;
alter table profiles
  add constraint profiles_photo_count_check
  check (cardinality(photo_urls) between 4 and 6);

-- Seed profiles mirror the same presentation guarantees.
alter table seed_profiles
  add column if not exists gender text;
alter table seed_profiles
  add column if not exists gender_preference text;
alter table seed_profiles
  add column if not exists height_cm int;
alter table seed_profiles
  add column if not exists ethnicity text;
alter table seed_profiles
  add column if not exists photo_urls text[];

update seed_profiles
  set gender = coalesce(nullif(gender, ''), 'other')
  where gender is null;
update seed_profiles
  set gender_preference = coalesce(nullif(gender_preference, ''), 'everyone')
  where gender_preference is null;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seed_profiles'
      and column_name = 'photo_url'
  ) then
    update seed_profiles
      set photo_urls = case
        when (photo_urls is null or cardinality(photo_urls) = 0) and photo_url is not null then array[photo_url]
        else coalesce(photo_urls, '{}'::text[])
      end;
  else
    update seed_profiles
      set photo_urls = coalesce(photo_urls, '{}'::text[])
      where photo_urls is null;
  end if;
end;
$$;
update seed_profiles
  set photo_urls = photo_urls[1:6]
  where cardinality(photo_urls) > 6;

alter table seed_profiles alter column gender set not null;
alter table seed_profiles alter column gender_preference set not null;
alter table seed_profiles alter column photo_urls set not null;

alter table seed_profiles drop constraint if exists seed_profiles_gender_check;
alter table seed_profiles
  add constraint seed_profiles_gender_check
  check (gender in ('woman', 'man', 'nonbinary', 'other'));

alter table seed_profiles drop constraint if exists seed_profiles_gender_preference_check;
alter table seed_profiles
  add constraint seed_profiles_gender_preference_check
  check (gender_preference in ('women', 'men', 'everyone'));

alter table seed_profiles drop constraint if exists seed_profiles_photo_count_check;
alter table seed_profiles
  add constraint seed_profiles_photo_count_check
  check (cardinality(photo_urls) between 4 and 6);

-- track left-swipes on human profiles so they don’t reappear immediately
create table if not exists dismissed_profiles (
  user_id uuid references auth.users on delete cascade,
  target_user_id uuid references auth.users on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, target_user_id)
);

alter table dismissed_profiles enable row level security;
drop policy if exists "owner dismissed profile read" on dismissed_profiles;
create policy "owner dismissed profile read" on dismissed_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "owner dismissed profile write" on dismissed_profiles;
create policy "owner dismissed profile write" on dismissed_profiles
  for insert with check (auth.uid() = user_id);

-- Persist read receipts so the matches tab can show accurate unread badges.
create table if not exists message_read_receipts (
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table message_read_receipts enable row level security;
drop policy if exists "participant read receipts read" on message_read_receipts;
create policy "participant read receipts read" on message_read_receipts
  for select using (auth.uid() = user_id);
drop policy if exists "participant read receipts write" on message_read_receipts;
create policy "participant read receipts write" on message_read_receipts
  for insert with check (auth.uid() = user_id);
drop policy if exists "participant read receipts update" on message_read_receipts;
create policy "participant read receipts update" on message_read_receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists message_read_receipts_match_idx
  on message_read_receipts (match_id, user_id);

-- allow either participant in a match to update settings like autopilot toggles
drop policy if exists "participant update match" on matches;
create policy "participant update match" on matches
  for update using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- ensure both participants can send messages (user_a or user_b)
drop policy if exists "participant write messages" on messages;
create policy "participant write messages" on messages
  for insert with check (
    sender_id = auth.uid() and
    exists (
      select 1
      from matches m
      where m.id = messages.match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- Summaries for the matches list: last message metadata + unread counts.
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
    select
      msg.id,
      msg.text,
      msg.created_at,
      msg.sender_id,
      msg.is_seed
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

-- refresh PostgREST so the new table/policy is immediately available
notify pgrst, 'reload schema';
