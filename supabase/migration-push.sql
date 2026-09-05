-- päivän sana — push subscriptions (daily word reminder)
create table if not exists public.ps_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ps_push_subscriptions_user_idx on public.ps_push_subscriptions(user_id);

alter table public.ps_push_subscriptions enable row level security;

drop policy if exists "push own select" on public.ps_push_subscriptions;
create policy "push own select" on public.ps_push_subscriptions
  for select using (auth.uid() = user_id);
drop policy if exists "push own insert" on public.ps_push_subscriptions;
create policy "push own insert" on public.ps_push_subscriptions
  for insert with check (auth.uid() = user_id);
drop policy if exists "push own update" on public.ps_push_subscriptions;
create policy "push own update" on public.ps_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "push own delete" on public.ps_push_subscriptions;
create policy "push own delete" on public.ps_push_subscriptions
  for delete using (auth.uid() = user_id);
