-- The web landing page shows live plan prices to visitors who haven't signed in yet.
-- Plans hold only public pricing and features, so anyone may read them (changes still need the server).
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to anon, authenticated using (true);
grant select on public.plans to anon;
