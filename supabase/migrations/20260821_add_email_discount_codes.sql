create table if not exists public.email_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text,
  offer_text text,
  ticket_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_discount_codes_code_not_blank check (length(btrim(code)) > 0),
  constraint email_discount_codes_ticket_url_https check (
    ticket_url is null or ticket_url = '' or ticket_url ~* '^https://'
  )
);

create unique index if not exists email_discount_codes_code_lower_key
  on public.email_discount_codes (lower(btrim(code)));

create index if not exists email_discount_codes_status_expiration_idx
  on public.email_discount_codes (status, expires_at, created_at desc);

alter table public.email_discount_codes enable row level security;
revoke all on public.email_discount_codes from anon, authenticated;

comment on table public.email_discount_codes is
  'Email Center reuse metadata only. Discount enforcement is managed separately.';
