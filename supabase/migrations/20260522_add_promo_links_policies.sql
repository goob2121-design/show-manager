alter table public.promo_links enable row level security;

drop policy if exists "Allow public read promo links" on public.promo_links;
drop policy if exists "Allow public insert promo links" on public.promo_links;
drop policy if exists "Allow public update promo links" on public.promo_links;
drop policy if exists "Allow public delete promo links" on public.promo_links;

create policy "Allow public read promo links"
on public.promo_links
for select
to anon, authenticated
using (true);

create policy "Allow public insert promo links"
on public.promo_links
for insert
to anon, authenticated
with check (true);

create policy "Allow public update promo links"
on public.promo_links
for update
to anon, authenticated
using (true)
with check (true);

create policy "Allow public delete promo links"
on public.promo_links
for delete
to anon, authenticated
using (true);
