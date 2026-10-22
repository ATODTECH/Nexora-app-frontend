-- The 14-day free trial is replaced by a permanent Free plan ($0 / ₦0) with strict limits.
-- New companies start on Free. A paid plan whose month or year ran out without renewal falls back to
-- the Free plan's limits (the company keeps its data and can renew any time).

insert into public.plans (key, name, sort, price_usd, price_ngn, price_usd_year, price_ngn_year, max_users, staff_seats,
                          monthly_ai_messages, connected_accounts, customer_records, active_workflows, knowledge_sources, contact_sales, blurb, features)
values ('free', 'Free', 0, 0, 0, 0, 0, 1, 0, 100, 1, 50, 0, 5, false,
  'Try Nexora on your own business, free. Upgrade when you need more.',
  array[
    '1 user and 1 workspace',
    'Basic Business Brain with up to 5 knowledge sources',
    'Basic AI assistant for business questions and response drafts',
    'Up to 100 AI tasks per month',
    'Up to 1 connected social account, where supported',
    'Basic customer and contact records, up to 50',
    'Basic task and reminder management',
    'Manual approval before external actions',
    'Basic dashboard and usage tracking'])
on conflict (key) do update set
  name = excluded.name, sort = excluded.sort, price_usd = excluded.price_usd, price_ngn = excluded.price_ngn,
  price_usd_year = excluded.price_usd_year, price_ngn_year = excluded.price_ngn_year, max_users = excluded.max_users,
  staff_seats = excluded.staff_seats, monthly_ai_messages = excluded.monthly_ai_messages,
  connected_accounts = excluded.connected_accounts, customer_records = excluded.customer_records,
  active_workflows = excluded.active_workflows, knowledge_sources = excluded.knowledge_sources,
  contact_sales = excluded.contact_sales, blurb = excluded.blurb, features = excluded.features;

-- New companies: Free plan, active, no trial.
alter table public.businesses alter column plan set default 'free';
alter table public.businesses alter column subscription_status set default 'active';
alter table public.businesses alter column trial_ends_at drop not null;
alter table public.businesses alter column trial_ends_at set default null;

-- Companies on a trial move to Free now. (The billing triggers only let the server change these columns,
-- so this migration runs those two updates as the server role for this transaction only.)
select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.role', 'service_role', true);
update public.businesses set plan = 'free', subscription_status = 'active', trial_ends_at = null, current_period_end = null
where subscription_status = 'trialing';
update public.businesses set trial_ends_at = null where trial_ends_at is not null;

drop function if exists public.set_trial_plan(text);

-- The plan whose limits apply now: the paid plan while it's paid up, otherwise Free.
create or replace function public.effective_plan(p_business uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when b.subscription_status = 'active' and (b.current_period_end is null or b.current_period_end > now()) then b.plan else 'free' end
  from public.businesses b where b.id = p_business;
$function$;

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
  from public.plans p where p.key = public.effective_plan(p_business);
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
    when 'active_workflows' then case when p_limit = 0
      then format('Automations aren''t included in the %s plan. Upgrade to let Nexora handle these for you.', p.name)
      else format('Your %s plan allows %s active automation%s. Turn one off or upgrade to add more.', p.name, p_limit, case when p_limit = 1 then '' else 's' end) end
    when 'knowledge_sources' then format('Your %s plan allows %s knowledge documents. Remove one or upgrade to add more.', p.name, p_limit)
  end
  from public.plans p where p.key = public.effective_plan(p_business);
$function$;

-- Staff seats follow the plan that applies now.
create or replace function public.create_staff_invite()
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_uid uuid := (select auth.uid()); v_b public.businesses; v_seats int; v_name text; v_used int; v_code text;
begin
  select * into v_b from public.businesses where owner_id = v_uid;
  if v_b.id is null then raise exception 'Only a business owner can invite staff'; end if;
  select staff_seats, name into v_seats, v_name from public.plans where key = public.effective_plan(v_b.id);
  select (select count(*) from public.business_members where business_id = v_b.id and role = 'staff' and status = 'active')
       + (select count(*) from public.staff_invites where business_id = v_b.id and used_by is null and expires_at > now()) into v_used;
  if v_seats is not null and v_used >= v_seats then
    if v_seats = 0 then raise exception 'Your % plan is for 1 user. Upgrade to Pro to invite staff.', v_name; end if;
    raise exception 'Your % plan allows % users including you. Upgrade to add more.', v_name, v_seats + 1;
  end if;
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text || v_uid::text), 1, 8));
  insert into public.staff_invites (business_id, code, created_by) values (v_b.id, v_code, v_uid);
  return v_code;
end $function$;

-- Seats and AI tasks shown in the app are those of the plan that applies now.
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
  join public.plans pl on pl.key = public.effective_plan(b.id)
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$function$;

revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.plan_limit(uuid, text) from public, anon, authenticated;
revoke execute on function public.plan_limit_message(uuid, text, integer) from public, anon, authenticated;
