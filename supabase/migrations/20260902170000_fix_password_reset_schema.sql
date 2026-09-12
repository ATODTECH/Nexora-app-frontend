alter table public.password_reset_otps alter column otp drop not null;
alter table public.password_reset_otps drop column if exists reset_token;