-- ============================================================
-- päivän sana — feature flags
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- Lets admin ship new code to production but keep it dormant
-- until enabled. Each flag is simply ON or OFF for everyone.
-- ============================================================

create table if not exists public.ps_feature_flags (
  key         text primary key,
  description text not null default '',
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.ps_feature_flags enable row level security;

-- everyone signed in may read flags (needed to gate features client-side)
drop policy if exists "flags read" on public.ps_feature_flags;
create policy "flags read" on public.ps_feature_flags
  for select using (auth.uid() is not null);

-- only admins may create/change/delete flags
drop policy if exists "flags admin write" on public.ps_feature_flags;
create policy "flags admin write" on public.ps_feature_flags
  for all using (public.is_admin()) with check (public.is_admin());
