-- ============================================================
-- päivän sana — Supabase schema
-- Same project as tidy/homey/leafy — own tables, no collisions.
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- tables ----------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'elev' check (role in ('elev', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.words (
  id            uuid primary key default gen_random_uuid(),
  finnish       text not null,
  swedish       text not null,
  assigned_date date,                          -- null = in queue
  drawn_at      timestamptz,                   -- when it was drawn from queue
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (finnish, swedish)
);

create index if not exists words_assigned_date_idx on public.words(assigned_date);
create index if not exists words_queue_idx on public.words(id) where assigned_date is null;

create table if not exists public.attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  word_id    uuid not null references public.words(id) on delete cascade,
  direction  text not null check (direction in ('fi_sv', 'sv_fi')),
  correct    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_idx on public.attempts(user_id);
create index if not exists attempts_word_idx on public.attempts(word_id);

-- per-user UI state (e.g. which side of today's word was shown last)
create table if not exists public.user_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ---------- row level security ----------

alter table public.profiles   enable row level security;
alter table public.words      enable row level security;
alter table public.attempts   enable row level security;
alter table public.user_state enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles: read own (or admin reads all); self-heal insert as 'elev' only
drop policy if exists "profiles own select" on public.profiles;
create policy "profiles own select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles
  for insert with check (auth.uid() = id and role = 'elev');

-- words: everyone signed-in reads words with assigned_date <= today;
-- admin reads/writes everything
drop policy if exists "words elev select" on public.words;
create policy "words elev select" on public.words
  for select using (
    assigned_date is not null
    and assigned_date <= (now() at time zone 'Europe/Stockholm')::date
  );

drop policy if exists "words admin all" on public.words;
create policy "words admin all" on public.words
  for all using (public.is_admin()) with check (public.is_admin());

-- attempts: own rows only
drop policy if exists "attempts own select" on public.attempts;
create policy "attempts own select" on public.attempts
  for select using (auth.uid() = user_id);
drop policy if exists "attempts own insert" on public.attempts;
create policy "attempts own insert" on public.attempts
  for insert with check (auth.uid() = user_id);

-- user_state: own rows only
drop policy if exists "state own select" on public.user_state;
create policy "state own select" on public.user_state
  for select using (auth.uid() = user_id);
drop policy if exists "state own upsert" on public.user_state;
create policy "state own upsert" on public.user_state
  for insert with check (auth.uid() = user_id);
drop policy if exists "state own update" on public.user_state;
create policy "state own update" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- seed profile on signup ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'elev')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- atomic daily draw ----------

-- Returns today's word. If none assigned yet, draws a random word from
-- the queue and assigns it — atomically, so concurrent clients can never
-- draw different words. First caller of the day triggers the draw.
create or replace function public.get_daily_word(p_date date default null)
returns setof public.words
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_date date := coalesce(p_date, v_today);
  v_word public.words%rowtype;
begin
  -- non-admins may only ask for today or earlier (no peeking at the schedule)
  if v_date > v_today and not public.is_admin() then
    v_date := v_today;
  end if;
  -- already assigned for today?
  select * into v_word from public.words where assigned_date = v_date;
  if found then
    return next v_word;
    return;
  end if;

  -- draw a random queued word; SKIP LOCKED makes concurrent draws safe
  select * into v_word
  from public.words
  where assigned_date is null
  order by random()
  limit 1
  for update skip locked;

  if found then
    update public.words
    set assigned_date = v_date, drawn_at = now()
    where id = v_word.id
    returning * into v_word;
    return next v_word;
  end if;

  -- queue empty: maybe someone else just assigned today's word
  select * into v_word from public.words where assigned_date = v_date;
  if found then
    return next v_word;
  end if;

  return; -- no word available
end;
$$;

-- ---------- after running this ----------
-- Make herrsilen@gmail.com admin (after the account exists):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'herrsilen@gmail.com');
