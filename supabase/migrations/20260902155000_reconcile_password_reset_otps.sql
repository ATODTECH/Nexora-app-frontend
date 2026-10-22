alter table public.password_reset_otps
add column if not exists otp text;

alter table public.password_reset_otps
add column if not exists expires_at timestamptz;

alter table public.password_reset_otps
add column if not exists attempts integer not null default 0;

alter table public.password_reset_otps
add column if not exists used boolean not null default false;

alter table public.password_reset_otps
add column if not exists reset_token text;

alter table public.password_reset_otps
add column if not exists reset_token_expires_at timestamptz;

alter table public.password_reset_otps
add column if not exists created_at timestamptz not null default now();

alter table public.password_reset_otps
enable row level security;