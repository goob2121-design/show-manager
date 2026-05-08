alter table public.sponsor_library
  add column if not exists sponsorship_level text,
  add column if not exists sponsorship_amount numeric,
  add column if not exists payment_status text default 'prospect',
  add column if not exists proposal_generated_at timestamptz,
  add column if not exists quote_generated_at timestamptz,
  add column if not exists receipt_generated_at timestamptz;
