# Nuntia (Direct Messages Only)

This app now supports only private chat between 2 users (no public chat).

## 1) Configure Supabase keys

Set these at the top of [app.js](app.js):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 2) Required database schema

Run this in Supabase SQL editor:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text,
  status text default 'online',
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  reply_to_id bigint references public.messages(id) on delete set null,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.message_reactions (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);

create table if not exists public.typing_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists messages_dm_idx on public.messages(sender_id, recipient_id, created_at);
```

## 3) RLS (private 2-user threads)

```sql
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.typing_status enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "messages_select_dm" on public.messages;
drop policy if exists "messages_insert_dm" on public.messages;
drop policy if exists "messages_update_sender" on public.messages;
drop policy if exists "messages_delete_sender" on public.messages;
drop policy if exists "reactions_select_dm" on public.message_reactions;
drop policy if exists "reactions_write_own" on public.message_reactions;
drop policy if exists "typing_upsert_self" on public.typing_status;

create policy "profiles_read_all" on public.profiles
for select to authenticated using (true);

create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
for update to authenticated using (auth.uid() = id);

create policy "messages_select_dm" on public.messages
for select to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "messages_insert_dm" on public.messages
for insert to authenticated
with check (auth.uid() = sender_id and sender_id <> recipient_id);

create policy "messages_update_sender" on public.messages
for update to authenticated
using (auth.uid() = sender_id);

create policy "messages_delete_sender" on public.messages
for delete to authenticated
using (auth.uid() = sender_id);

create policy "reactions_select_dm" on public.message_reactions
for select to authenticated
using (
  exists (
    select 1 from public.messages m
    where m.id = message_id
      and (auth.uid() = m.sender_id or auth.uid() = m.recipient_id)
  )
);

create policy "reactions_write_own" on public.message_reactions
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "typing_upsert_self" on public.typing_status
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 4) Enable realtime

In Supabase → Database → Replication, enable realtime for:

- `public.messages`
- `public.message_reactions`

## 5) Run locally

```bash
python3 -m http.server 5500
```

Open `http://localhost:5500`.

## Profile features (small DB)

Profile now includes Tacivio-style tabs with:

- Account: username, status, bio, mood emoji
- Preferences: compact chat mode + bubble style
- Activity: sent/received/contacts stats

These settings are stored in `profiles.preferences` (or localStorage fallback if column migration is unavailable).
