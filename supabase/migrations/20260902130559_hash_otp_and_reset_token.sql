create table if not exists password_reset_otps (
  email text primary key,
  otp_hash text,
  expires_at timestamptz,
  attempts int not null default 0,
  used boolean not null default false,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table password_reset_otps enable row level security;