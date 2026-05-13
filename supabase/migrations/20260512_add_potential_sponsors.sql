create table if not exists public.potential_sponsors (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  status text not null default 'Not Contacted',
  created_at timestamptz not null default now()
);
