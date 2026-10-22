-- Enforce each plan's limits: AI tasks a month, connected accounts, customer records,
-- active workflow automations (owner rules) and Business Brain knowledge sources (uploaded documents).
-- Limits are per business: rows of every active member count. A null limit means custom / not capped,
-- and people without a business aren't limited.

-- ---------- AI tasks: one row per AI reply or action Nexora takes ----------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid,
  kind text not null,
  tasks integer not null default 1 check (tasks > 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_business_idx on public.ai_usage (business_id, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select to authenticated using (public.is_business_member(business_id));

create or replace function public.business_of(p_user uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select business_id from public.business_members where user_id = p_user and status = 'active' limit 1;
$function$;

-- How much of a limited resource a business uses now.
create or replace function public.plan_usage(p_business uuid, p_kind text)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  with members as (select user_id from public.business_members where business_id = p_business and status = 'active')
  select case p_kind
    when 'ai_tasks' then (select coalesce(sum(tasks), 0)::int from public.ai_usage where business_id = p_business and created_at >= date_trunc('month', now()))
    when 'connected_accounts' then (select count(*)::int from public.channel_connections where connected and user_id in (select user_id from members))
    when 'customer_records' then (select count(*)::int from public.customers where user_id in (select user_id from members))
    when 'active_workflows' then (select count(*)::int from public.owner_rules where enabled and user_id in (select user_id from members))
    when 'knowledge_sources' then (select count(*)::int from public.knowledge_documents where user_id in (select user_id from members))
  end;
$function$;

-- The business plan's limit for a resource (null = custom / not capped).
create or replace function public.plan_limit(p_business uuid, p_kind text)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case p_kind
    when 'ai_tasks' then p.monthly_ai_messages
    when 'connected_accounts' then p.connected_accounts
    when 'customer_records' then p.customer_records
    when 'active_workflows' then p.active_workflows
    when 'knowledge_sources' then p.knowledge_sources
  end
  from public.businesses b join public.plans p on p.key = b.plan
  where b.id = p_business;
$function$;

create or replace function public.plan_limit_message(p_business uuid, p_kind text, p_limit integer)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case p_kind
    when 'ai_tasks' then format('Your business has used all %s AI tasks on the %s plan this month. They reset on the 1st, or upgrade for more.', to_char(p_limit, 'FM999,999,999'), p.name)
    when 'connected_accounts' then format('Your %s plan allows %s connected account%s. Disconnect one or upgrade to connect more.', p.name, p_limit, case when p_limit = 1 then '' else 's' end)
    when 'customer_records' then format('Your %s plan holds up to %s customer records. Remove old ones or upgrade to add more.', p.name, to_char(p_limit, 'FM999,999,999'))
    when 'active_workflows' then format('Your %s plan allows %s active automation%s. Turn one off or upgrade to add more.', p.name, p_limit, case when p_limit = 1 then '' else 's' end)
    when 'knowledge_sources' then format('Your %s plan allows %s knowledge documents. Remove one or upgrade to add more.', p.name, p_limit)
  end
  from public.businesses b join public.plans p on p.key = b.plan
  where b.id = p_business;
$function$;

-- Can this person's business add one more of a resource? {ok, used, limit, message}
create or replace function public.check_plan_limit(p_user uuid, p_kind text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_b uuid := public.business_of(p_user); v_limit int; v_used int;
begin
  if v_b is null then return jsonb_build_object('ok', true); end if;
  v_limit := public.plan_limit(v_b, p_kind);
  if v_limit is null then return jsonb_build_object('ok', true); end if;
  v_used := public.plan_usage(v_b, p_kind);
  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit, 'message', public.plan_limit_message(v_b, p_kind, v_limit));
  end if;
  return jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit);
end $function$;

-- Records AI tasks for this person's business. With p_check, refuses (ok=false) when no task is left this month.
-- p_count 0 only checks. Server functions call this before (check) and after (record) each AI reply or action.
create or replace function public.use_ai_task(p_user uuid, p_kind text, p_count integer default 1, p_check boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_b uuid := public.business_of(p_user); v_limit int; v_used int;
begin
  if v_b is null then return jsonb_build_object('ok', true); end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_b::text, 0));   -- one count at a time per business
  v_limit := public.plan_limit(v_b, 'ai_tasks');
  v_used := public.plan_usage(v_b, 'ai_tasks');
  if p_check and v_limit is not null and v_used >= v_limit then
    return jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit, 'message', public.plan_limit_message(v_b, 'ai_tasks', v_limit));
  end if;
  if coalesce(p_count, 0) > 0 then
    insert into public.ai_usage (business_id, user_id, kind, tasks) values (v_b, p_user, left(coalesce(p_kind, 'task'), 40), p_count);
    v_used := v_used + p_count;
  end if;
  return jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit);
end $function$;

-- ---------- Hard limits on rows (whoever adds them: the app, a server function or the AI) ----------
create or replace function public.enforce_plan_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_kind text := tg_argv[0]; v_b uuid; v_limit int;
begin
  -- Only adding counts: a newly connected account, a newly enabled automation, a new customer or document.
  -- (Nested so each table's own columns are only read on that table.)
  if v_kind = 'connected_accounts' then
    if not coalesce(new.connected, false) then return new; end if;
    if tg_op = 'UPDATE' then if coalesce(old.connected, false) then return new; end if; end if;
    -- Reconnecting (an upsert fires the insert trigger too) doesn't add an account.
    if exists (select 1 from public.channel_connections c where c.user_id = new.user_id and c.channel_key = new.channel_key and c.connected) then return new; end if;
  elsif v_kind = 'active_workflows' then
    if not coalesce(new.enabled, false) then return new; end if;
    if tg_op = 'UPDATE' then if coalesce(old.enabled, false) then return new; end if; end if;
  end if;
  v_b := public.business_of(new.user_id);
  if v_b is null then return new; end if;
  v_limit := public.plan_limit(v_b, v_kind);
  if v_limit is not null and public.plan_usage(v_b, v_kind) >= v_limit then
    raise exception using errcode = 'P0001', message = public.plan_limit_message(v_b, v_kind, v_limit), hint = 'plan_limit:' || v_kind;
  end if;
  return new;
end $function$;

drop trigger if exists plan_limit_connected_accounts on public.channel_connections;
create trigger plan_limit_connected_accounts before insert or update of connected on public.channel_connections
  for each row execute function public.enforce_plan_limit('connected_accounts');
drop trigger if exists plan_limit_customer_records on public.customers;
create trigger plan_limit_customer_records before insert on public.customers
  for each row execute function public.enforce_plan_limit('customer_records');
drop trigger if exists plan_limit_active_workflows on public.owner_rules;
create trigger plan_limit_active_workflows before insert or update of enabled on public.owner_rules
  for each row execute function public.enforce_plan_limit('active_workflows');
drop trigger if exists plan_limit_knowledge_sources on public.knowledge_documents;
create trigger plan_limit_knowledge_sources before insert on public.knowledge_documents
  for each row execute function public.enforce_plan_limit('knowledge_sources');

-- ---------- What the app shows ----------
-- Usage and limits of the signed-in member's business, for Plans & billing.
create or replace function public.my_plan_usage()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_b uuid := public.business_of((select auth.uid())); v_out jsonb := '{}'; k text;
begin
  if v_b is null then return null; end if;
  foreach k in array array['ai_tasks', 'connected_accounts', 'customer_records', 'active_workflows', 'knowledge_sources'] loop
    v_out := v_out || jsonb_build_object(k, jsonb_build_object('used', public.plan_usage(v_b, k), 'limit', public.plan_limit(v_b, k)));
  end loop;
  return v_out;
end $function$;

-- ai_messages_used now reports AI tasks (every AI reply or action), not owner chat messages.
create or replace function public.my_workspace()
 returns table(business_id uuid, name text, industry text, country text, plan text, subscription_status text, trial_ends_at timestamp with time zone, role text, owner_name text, staff_seats integer, monthly_ai_messages integer, ai_messages_used integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select b.id, b.name, b.industry, b.country, b.plan,
         case when b.subscription_status = 'active' and b.current_period_end is not null and b.current_period_end < now()
              then 'past_due' else b.subscription_status end,
         b.trial_ends_at, m.role,
         coalesce((select p.full_name from public.profiles p where p.id = b.owner_id), ''),
         pl.staff_seats, pl.monthly_ai_messages,
         public.plan_usage(b.id, 'ai_tasks')
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  join public.plans pl on pl.key = b.plan
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$function$;

-- Only server functions may count usage or look up other businesses' limits.
revoke execute on function public.business_of(uuid) from public, anon, authenticated;
revoke execute on function public.plan_usage(uuid, text) from public, anon, authenticated;
revoke execute on function public.plan_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public.plan_limit_message(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.check_plan_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public.use_ai_task(uuid, text, integer, boolean) from public, anon, authenticated;
revoke execute on function public.enforce_plan_limit() from public, anon, authenticated;
grant execute on function public.check_plan_limit(uuid, text) to service_role;
grant execute on function public.use_ai_task(uuid, text, integer, boolean) to service_role;
revoke execute on function public.my_plan_usage() from public, anon;
grant execute on function public.my_plan_usage() to authenticated;
