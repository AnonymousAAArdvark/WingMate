-- Additional discover helpers: dismissed human profiles + relaxed match policy

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

-- refresh PostgREST so the new table/policy is immediately available
notify pgrst, 'reload schema';
