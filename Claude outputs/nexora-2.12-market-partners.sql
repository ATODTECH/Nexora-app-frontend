-- Nexora capability 2.12: Market, Partner Discovery and Business Opportunities
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again (it only adds what is missing).
-- Builds on the partner network from earlier capabilities (network_profiles, network_connections, network_contacts).

-- 1. Richer partner profiles: what kind of partner, categories, skills, rates, a portfolio, and a Verified badge.
alter table public.network_profiles
  add column if not exists kind text not null default 'business',
  add column if not exists categories text[] not null default '{}',
  add column if not exists skills text[] not null default '{}',
  add column if not exists rate text not null default '',
  add column if not exists portfolio jsonb not null default '[]'::jsonb,
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz;
do $$ begin
  alter table public.network_profiles add constraint network_profiles_kind_check
    check (kind in ('business','service_provider','freelancer','developer','agency','supplier','collaborator'));
exception when duplicate_object then null; end $$;

-- Only Nexora (the service role) can mark a profile Verified; owners can't verify themselves.
create or replace function public.nx_network_guard_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    if tg_op = 'INSERT' then new.verified := false; new.verified_at := null;
    else new.verified := old.verified; new.verified_at := old.verified_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists nx_network_guard_verified on public.network_profiles;
create trigger nx_network_guard_verified before insert or update on public.network_profiles
  for each row execute function public.nx_network_guard_verified();

-- 2. Project requests (project requirements a business posts, e.g. "Build a booking website").
create table if not exists public.network_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  category text not null default 'other',
  kind_needed text not null default 'any',
  description text not null default '' check (char_length(description) <= 4000),
  requirements text[] not null default '{}',
  budget text not null default '' check (char_length(budget) <= 80),
  timeline text not null default '' check (char_length(timeline) <= 80),
  location text not null default '' check (char_length(location) <= 80),
  remote_ok boolean not null default true,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.network_requests enable row level security;
drop policy if exists "requests read" on public.network_requests;
create policy "requests read" on public.network_requests for select to authenticated
  using (status = 'open' or user_id = (select auth.uid()));
drop policy if exists "requests write own" on public.network_requests;
create policy "requests write own" on public.network_requests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists network_requests_open on public.network_requests (status, created_at desc);

-- 3. A reply to a project request is an introduction (contacts stay private until accepted), linked to the request.
alter table public.network_connections add column if not exists request_id uuid references public.network_requests(id) on delete set null;
drop policy if exists "connections create" on public.network_connections;
create policy "connections create" on public.network_connections for insert to authenticated
  with check (
    from_user = (select auth.uid()) and status = 'pending' and to_user <> (select auth.uid()) and (
      exists (select 1 from public.network_profiles p where p.user_id = network_connections.to_user and p.visible)
      or exists (select 1 from public.network_requests r where r.id = network_connections.request_id
                 and r.user_id = network_connections.to_user and r.status = 'open')
    )
  );

-- 4. Reviews: only after an accepted introduction, one per person per introduction.
create table if not exists public.network_reviews (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.network_connections(id) on delete cascade,
  reviewer uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reviewee uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (connection_id, reviewer)
);
alter table public.network_reviews enable row level security;
drop policy if exists "reviews read" on public.network_reviews;
create policy "reviews read" on public.network_reviews for select to authenticated using (true);
drop policy if exists "reviews write" on public.network_reviews;
create policy "reviews write" on public.network_reviews for insert to authenticated
  with check (
    reviewer = (select auth.uid()) and reviewee <> reviewer and exists (
      select 1 from public.network_connections c where c.id = connection_id and c.status = 'accepted'
        and ((c.from_user = reviewer and c.to_user = reviewee) or (c.to_user = reviewer and c.from_user = reviewee))
    )
  );
drop policy if exists "reviews delete own" on public.network_reviews;
create policy "reviews delete own" on public.network_reviews for delete to authenticated using (reviewer = (select auth.uid()));

-- 5. Referrals (who recommended a provider to whom). Kept for future referral rewards and commissions.
create table if not exists public.network_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider uuid not null references auth.users(id) on delete cascade,
  to_name text not null default '' check (char_length(to_name) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
alter table public.network_referrals enable row level security;
drop policy if exists "referrals write own" on public.network_referrals;
create policy "referrals write own" on public.network_referrals for insert to authenticated
  with check (referrer = (select auth.uid()) and provider <> referrer);
drop policy if exists "referrals read" on public.network_referrals;
create policy "referrals read" on public.network_referrals for select to authenticated
  using (referrer = (select auth.uid()) or provider = (select auth.uid()));

-- 6. Reports and disputes: a member reports a problem with a profile, request or introduction; Nexora reviews it.
create table if not exists public.network_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_user uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.network_connections(id) on delete set null,
  request_id uuid references public.network_requests(id) on delete set null,
  reason text not null check (reason in ('spam','fake','no_show','quality','payment','other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  created_at timestamptz not null default now()
);
alter table public.network_reports enable row level security;
drop policy if exists "reports write own" on public.network_reports;
create policy "reports write own" on public.network_reports for insert to authenticated
  with check (reporter = (select auth.uid()) and target_user <> reporter and status = 'open');
drop policy if exists "reports read own" on public.network_reports;
create policy "reports read own" on public.network_reports for select to authenticated using (reporter = (select auth.uid()));
