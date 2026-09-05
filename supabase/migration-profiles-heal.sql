-- fix: make herrsilen@gmail.com admin (works whether profile row is missing or exists)
insert into public.profiles (id, role)
select id, 'admin' from auth.users where email = 'herrsilen@gmail.com'
on conflict (id) do update set role = 'admin';

-- allow the app to self-heal a missing profile row (role forced to 'elev' by RLS)
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles
  for insert with check (auth.uid() = id and role = 'elev');
