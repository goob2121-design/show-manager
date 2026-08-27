alter table public.show_reserved_seating_links
  add column if not exists source_show_sponsor_id uuid
    references public.show_sponsors(id) on delete set null;

-- Backfill only one-to-one, unambiguous exact matches. Multiple links for the
-- same sponsor or multiple sponsor matches are left null for manual review.
with matches as (
  select link.id as link_id, show_sponsor.id as show_sponsor_id
  from public.show_reserved_seating_links link
  join public.show_sponsors show_sponsor on show_sponsor.show_id = link.show_id
  left join public.sponsor_library sponsor on sponsor.id = show_sponsor.sponsor_id
  where link.source_show_sponsor_id is null
    and (link.is_complimentary or link.seat_category = 'comp')
    and lower(trim(link.customer_name)) in (
      lower(trim(coalesce(sponsor.name, ''))),
      lower(trim(coalesce(sponsor.recognition_name, ''))),
      lower(trim(coalesce(show_sponsor.custom_note, '')))
    )
), unambiguous_links as (
  select link_id, min(show_sponsor_id::text)::uuid as show_sponsor_id
  from matches
  group by link_id
  having count(*) = 1
), one_to_one_matches as (
  select min(link_id::text)::uuid as link_id, show_sponsor_id
  from unambiguous_links
  group by show_sponsor_id
  having count(*) = 1
)
update public.show_reserved_seating_links link
set source_show_sponsor_id = match.show_sponsor_id
from one_to_one_matches match
where link.id = match.link_id;

create unique index if not exists show_reserved_seating_links_show_source_sponsor_unique
  on public.show_reserved_seating_links(show_id, source_show_sponsor_id)
  where source_show_sponsor_id is not null;