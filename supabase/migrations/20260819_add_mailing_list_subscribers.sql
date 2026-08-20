create table if not exists public.mailing_list_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  source text not null default 'other' check (source in ('website', 'admin', 'ticket_opt_in', 'import', 'other')),
  metadata jsonb not null default '{}'::jsonb,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  last_campaign_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailing_list_email_not_blank check (length(btrim(email)) > 3)
);

create unique index if not exists mailing_list_subscribers_email_lower_key
  on public.mailing_list_subscribers (lower(btrim(email)));
create index if not exists mailing_list_subscribers_status_idx
  on public.mailing_list_subscribers (status, created_at desc);

alter table public.mailing_list_subscribers enable row level security;
revoke all on public.mailing_list_subscribers from anon, authenticated;

comment on table public.mailing_list_subscribers is
  'Standalone promotional mailing list. Never used to suppress transactional ticket or reserved-seat email.';
