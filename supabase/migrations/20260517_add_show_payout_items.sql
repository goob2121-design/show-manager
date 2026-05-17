create table if not exists public.show_payout_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  payee_name text not null,
  category text,
  description text,
  amount numeric not null default 0,
  paid boolean not null default false,
  payment_method text,
  created_at timestamptz not null default now()
);

create index if not exists show_payout_items_show_id_created_at_idx
  on public.show_payout_items(show_id, created_at);

alter table public.show_payout_items enable row level security;

drop policy if exists "Allow public read show payout items" on public.show_payout_items;
drop policy if exists "Allow public insert show payout items" on public.show_payout_items;
drop policy if exists "Allow public update show payout items" on public.show_payout_items;
drop policy if exists "Allow public delete show payout items" on public.show_payout_items;

create policy "Allow public read show payout items"
on public.show_payout_items
for select
to anon, authenticated
using (true);

create policy "Allow public insert show payout items"
on public.show_payout_items
for insert
to anon, authenticated
with check (true);

create policy "Allow public update show payout items"
on public.show_payout_items
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete show payout items"
on public.show_payout_items
for delete
to anon, authenticated
using (true);
