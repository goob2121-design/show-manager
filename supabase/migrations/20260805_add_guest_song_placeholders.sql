alter table public.show_guest_songs
  add column if not exists guest_profile_id uuid references public.guest_profiles(id) on delete restrict,
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists placeholder_number integer;

create unique index if not exists show_guest_songs_placeholder_number_idx
  on public.show_guest_songs(show_id, guest_profile_id, placeholder_number)
  where is_placeholder = true;

alter table public.show_guest_songs
  drop constraint if exists show_guest_songs_placeholder_fields_check,
  add constraint show_guest_songs_placeholder_fields_check check (
    (is_placeholder = false and placeholder_number is null)
    or
    (is_placeholder = true and guest_profile_id is not null and placeholder_number > 0)
  );
