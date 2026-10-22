alter table public.password_reset_otps
  add column reset_token text,
  add column reset_token_expires_at timestamptz;

create index if not exists password_reset_otps_reset_token_idx
  on public.password_reset_otps (reset_token);