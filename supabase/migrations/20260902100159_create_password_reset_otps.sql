create table public.password_reset_otps(
  email text primary key,
  otp text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.password_reset_otps enable row level security;