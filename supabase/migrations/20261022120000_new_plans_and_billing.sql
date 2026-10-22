-- New Nexora plans (October 2026): Starter, Pro, Business, Organization.
-- Fixed Naira prices (no longer converted from USD), yearly billing, plan limits and feature lists.
-- Organization is quoted by sales and cannot be bought in the app.

alter table public.plans
  add column if not exists price_ngn numeric,
  add column if not exists price_usd_year numeric,
  add column if not exists price_ngn_year numeric,
  add column if not exists max_users integer,
  add column if not exists connected_accounts integer,
  add column if not exists customer_records integer,
  add column if not exists active_workflows integer,
  add column if not exists knowledge_sources integer,
  add column if not exists features text[] not null default '{}',
  add column if not exists contact_sales boolean not null default false;
-- Organization seats are agreed per customer, so the limit can be empty (= custom).
alter table public.plans alter column staff_seats drop not null;

-- staff_seats = users other than the owner. monthly_ai_messages now means AI tasks a month.
-- null limits mean custom / not capped by the app.
insert into public.plans (key, name, sort, price_usd, price_ngn, price_usd_year, price_ngn_year, max_users, staff_seats,
                          monthly_ai_messages, connected_accounts, customer_records, active_workflows, knowledge_sources, contact_sales, blurb, features)
values
  ('starter', 'Starter', 1, 9, 7500, 90, 75000, 1, 0, 1000, 3, 1000, 3, 25, false,
   'For freelancers, solo business owners and small businesses that want to start automating their daily operations.',
   array[
     '1 user and up to 3 connected social and communication accounts',
     'Up to 1,000 AI tasks per month',
     'Business Brain with up to 25 knowledge sources',
     'AI Receptionist for approved FAQs and response assistance',
     'AI Sales Assistant for lead capture and qualification',
     'Up to 1,000 customer records',
     'Up to 3 active workflow automations',
     'Basic follow-up reminders',
     'Basic calendar integration',
     'Customer conversation history',
     'Basic reports and email support']),
  ('pro', 'Pro', 2, 24, 19900, 240, 199000, 3, 2, 5000, 6, 10000, 15, null, false,
   'For growing businesses that need more than basic AI replies and want to manage customer communication and business activities in one place.',
   array[
     'Up to 3 users',
     'Up to 6 connected accounts',
     'Up to 5,000 AI tasks per month',
     'Up to 10,000 customer records',
     'Expanded Business Brain knowledge capacity',
     'AI Receptionist and AI Sales Assistant automation',
     'Lead routing and high-intent lead alerts',
     'Customer history and interaction summaries',
     'Up to 15 active workflow automations',
     'Calendar integrations and meeting scheduling',
     'Social media content drafting and platform-specific adaptation',
     'Advanced operational reports and data export',
     'Human takeover and AI pause controls',
     'Priority support']),
  ('business', 'Business', 3, 69, 59900, 690, 599000, 10, 9, 20000, 10, 50000, 50, null, false,
   'For established businesses with teams that need to manage customer communication, sales and operations from one workspace.',
   array[
     'Up to 10 users',
     'Up to 10 connected accounts',
     'Up to 20,000 AI tasks per month',
     'Up to 50,000 customer records',
     'Multiple AI Employees with different responsibilities',
     'Shared team inbox and staff assignment',
     'Up to 50 active workflow automations',
     'Advanced Business Brain with knowledge versioning and approval controls',
     'Custom workflow rules and approval processes',
     'Configurable limits for discounts and other permitted AI actions',
     'Team roles and permissions',
     'Audit logs and usage controls',
     'Advanced dashboards and scheduled reports',
     'Expanded integrations and API access',
     'Priority support and guided onboarding']),
  ('organization', 'Organization', 4, 299, null, null, null, null, null, null, null, null, null, null, true,
   'Custom pricing based on users, AI usage, integrations, security requirements and support. Naira and other regional prices are quoted for your location, requirements and applicable taxes.',
   array[
     'Custom user and workspace limits',
     'Custom AI task allowance and volume pricing',
     'Multiple departments and business units',
     'Advanced user roles and access controls',
     'Enterprise security and audit capabilities',
     'Custom integrations and API limits',
     'Advanced reporting and administration',
     'Data retention and governance controls',
     'Dedicated onboarding and account management',
     'Contractual support and service-level agreements where available',
     'Custom deployment or enhanced data isolation where technically supported'])
on conflict (key) do update set
  name = excluded.name, sort = excluded.sort, price_usd = excluded.price_usd, price_ngn = excluded.price_ngn,
  price_usd_year = excluded.price_usd_year, price_ngn_year = excluded.price_ngn_year, max_users = excluded.max_users,
  staff_seats = excluded.staff_seats, monthly_ai_messages = excluded.monthly_ai_messages,
  connected_accounts = excluded.connected_accounts, customer_records = excluded.customer_records,
  active_workflows = excluded.active_workflows, knowledge_sources = excluded.knowledge_sources,
  contact_sales = excluded.contact_sales, blurb = excluded.blurb, features = excluded.features;

-- The old Growth plan is replaced by Pro.
update public.businesses set plan = 'pro' where plan = 'growth';
delete from public.plans where key = 'growth';

-- Organization is set up by the Nexora team, so it can't be picked for a trial in the app.
create or replace function public.set_trial_plan(p_plan text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not exists (select 1 from public.plans where key = p_plan and not contact_sales) then raise exception 'Unknown plan'; end if;
  update public.businesses set plan = p_plan where owner_id = (select auth.uid()) and subscription_status = 'trialing';
end $function$;

-- Clearer message now that Starter has no staff seats (owner only). A null seat count means custom (Organization).
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
  select staff_seats, name into v_seats, v_name from public.plans where key = v_b.plan;
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
