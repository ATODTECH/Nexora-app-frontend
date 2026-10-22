-- =====================================================================
-- Nexora AI: self-learning knowledge, web knowledge and the partner network
-- Supabase Dashboard > SQL Editor > New query > paste ALL of this > Run.  (Run once; safe to re-run.)
-- Needs nexora-rag-setup.sql and nexora-rag-update.sql to have been run already.
-- =====================================================================

-- ---------- 1. Knowledge passages can now come from the web, with a source link and an expiry ----------
alter table public.knowledge_chunks add column if not exists source_url text;
alter table public.knowledge_chunks add column if not exists expires_at timestamptz;
alter table public.knowledge_chunks drop constraint if exists knowledge_chunks_source_type_check;
alter table public.knowledge_chunks add constraint knowledge_chunks_source_type_check
  check (source_type = any (array['item','document','web']));
create index if not exists knowledge_chunks_expiry_idx on public.knowledge_chunks (user_id, expires_at) where expires_at is not null;

-- Where a knowledge item came from: typed by the owner, learned from chats, or researched online.
alter table public.knowledge_items add column if not exists source text not null default 'owner';
alter table public.knowledge_items add column if not exists source_detail text not null default '';
alter table public.knowledge_items drop constraint if exists knowledge_items_source_check;
alter table public.knowledge_items add constraint knowledge_items_source_check
  check (source = any (array['owner','learned','web']));

-- ---------- 2. Search: skip expired web passages and return the source link ----------
drop function if exists public.match_knowledge(uuid, extensions.vector, text, int);
create or replace function public.match_knowledge(
  p_user uuid,
  query_embedding extensions.vector(384),
  query_text text,
  match_count int default 6
)
returns table (
  id uuid, source_type text, item_id uuid, document_id uuid, title text, category text,
  content text, similarity double precision, keyword boolean, score double precision, source_url text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  k int := least(greatest(coalesce(match_count, 6), 1), 20);
  q tsquery := nullif(replace(plainto_tsquery('english', coalesce(query_text, ''))::text, '&', '|'), '')::tsquery;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and (select auth.uid()) is distinct from p_user
     and not exists (
       select 1 from public.businesses b
         join public.business_members m on m.business_id = b.id
        where b.owner_id = p_user and m.user_id = (select auth.uid()) and m.status = 'active'
     ) then
    raise exception 'not allowed';
  end if;
  return query
  with sem as (
    select c.id cid,
           row_number() over (order by c.embedding operator(extensions.<#>) query_embedding) r,
           -(c.embedding operator(extensions.<#>) query_embedding) sim
      from public.knowledge_chunks c
     where c.user_id = p_user and c.embedding is not null and query_embedding is not null
       and (c.expires_at is null or c.expires_at > now())
     order by c.embedding operator(extensions.<#>) query_embedding
     limit k * 4
  ),
  kw as (
    select c.id cid,
           row_number() over (order by ts_rank_cd(c.fts, q) desc) r
      from public.knowledge_chunks c
     where c.user_id = p_user and q is not null and c.fts @@ q
       and (c.expires_at is null or c.expires_at > now())
     order by ts_rank_cd(c.fts, q) desc
     limit k * 4
  ),
  merged as (
    select coalesce(sem.cid, kw.cid) cid, coalesce(sem.sim, 0) sim, (kw.cid is not null) kwhit,
           coalesce(1.0 / (50 + sem.r), 0) + coalesce(1.0 / (50 + kw.r), 0) sc
      from sem full outer join kw on sem.cid = kw.cid
  )
  select c.id, c.source_type, c.item_id, c.document_id, c.title, c.category, c.content,
         m.sim::double precision, m.kwhit, m.sc::double precision, c.source_url
    from merged m join public.knowledge_chunks c on c.id = m.cid
   order by m.sc desc
   limit k;
end $$;
revoke all on function public.match_knowledge(uuid, extensions.vector, text, int) from public, anon;
grant execute on function public.match_knowledge(uuid, extensions.vector, text, int) to authenticated, service_role;

-- ---------- 3. Learning state (what Nexora has already read) ----------
create table if not exists public.learning_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  chats_until timestamptz not null default (now() - interval '30 days'),
  inbox_until timestamptz not null default (now() - interval '30 days'),
  researched_at timestamptz,
  last_run_at timestamptz,
  learned_total integer not null default 0
);
alter table public.learning_state enable row level security;
drop policy if exists "learning_state own" on public.learning_state;
create policy "learning_state own" on public.learning_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- 4. Partner network (opt-in) ----------
create table if not exists public.network_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  industry text not null default '',
  city text not null default '',
  country text not null default '',
  bio text not null default '' check (char_length(bio) <= 600),
  offers text not null default '' check (char_length(offers) <= 600),
  needs text not null default '' check (char_length(needs) <= 600),
  tags text[] not null default '{}',
  visible boolean not null default false,
  emb_profile extensions.vector(384),
  emb_offers extensions.vector(384),
  emb_needs extensions.vector(384),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.network_profiles enable row level security;
drop policy if exists "network read" on public.network_profiles;
create policy "network read" on public.network_profiles for select to authenticated
  using (visible or user_id = (select auth.uid()));
drop policy if exists "network write own" on public.network_profiles;
create policy "network write own" on public.network_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Contact details live apart from the profile and are only readable after a request is accepted.
create table if not exists public.network_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp text not null default '',
  email text not null default '',
  website text not null default ''
);
alter table public.network_contacts enable row level security;

create table if not exists public.network_connections (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status = any (array['pending','accepted','declined','cancelled'])),
  message text not null default '' check (char_length(message) <= 500),
  match_reason text not null default '',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user),
  check (from_user <> to_user)
);
alter table public.network_connections enable row level security;
drop policy if exists "connections read" on public.network_connections;
create policy "connections read" on public.network_connections for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
drop policy if exists "connections create" on public.network_connections;
create policy "connections create" on public.network_connections for insert to authenticated
  with check (from_user = (select auth.uid()) and status = 'pending'
              and exists (select 1 from public.network_profiles p where p.user_id = to_user and p.visible));
drop policy if exists "connections respond" on public.network_connections;
create policy "connections respond" on public.network_connections for update to authenticated
  using ((select auth.uid()) in (from_user, to_user))
  with check ((select auth.uid()) in (from_user, to_user));

drop policy if exists "contacts own" on public.network_contacts;
create policy "contacts own" on public.network_contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "contacts after accept" on public.network_contacts;
create policy "contacts after accept" on public.network_contacts for select to authenticated
  using (exists (select 1 from public.network_connections c
                  where c.status = 'accepted'
                    and ((c.from_user = (select auth.uid()) and c.to_user = network_contacts.user_id)
                      or (c.to_user = (select auth.uid()) and c.from_user = network_contacts.user_id))));

-- Best partners for a member: what they need vs what others offer (and the reverse), plus overall fit.
create or replace function public.match_network(p_user uuid, match_count int default 10)
returns table (user_id uuid, display_name text, industry text, city text, country text, bio text,
               offers text, needs text, tags text[], score double precision,
               need_fit double precision, offer_fit double precision, profile_fit double precision)
language plpgsql stable security definer set search_path = '' as $$
declare me public.network_profiles;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and (select auth.uid()) is distinct from p_user then
    raise exception 'not allowed';
  end if;
  select * into me from public.network_profiles where network_profiles.user_id = p_user;
  if me.user_id is null or me.emb_profile is null then return; end if;
  return query
  select p.user_id, p.display_name, p.industry, p.city, p.country, p.bio, p.offers, p.needs, p.tags,
         (0.45 * nf + 0.30 * of_ + 0.25 * pf + case when p.country = me.country and me.country <> '' then 0.03 else 0 end)::double precision,
         nf::double precision, of_::double precision, pf::double precision
    from (
      select p.*,
             coalesce(-(me.emb_needs  operator(extensions.<#>) p.emb_offers), 0) nf,
             coalesce(-(me.emb_offers operator(extensions.<#>) p.emb_needs), 0) of_,
             coalesce(-(me.emb_profile operator(extensions.<#>) p.emb_profile), 0) pf
        from public.network_profiles p
       where p.visible and p.user_id <> p_user and p.emb_profile is not null
         and not exists (select 1 from public.network_connections c
                          where (c.from_user = p_user and c.to_user = p.user_id)
                             or (c.to_user = p_user and c.from_user = p.user_id and c.status <> 'declined'))
    ) p
   order by 10 desc
   limit least(greatest(coalesce(match_count, 10), 1), 30);
end $$;
revoke all on function public.match_network(uuid, int) from public, anon;
grant execute on function public.match_network(uuid, int) to authenticated, service_role;
