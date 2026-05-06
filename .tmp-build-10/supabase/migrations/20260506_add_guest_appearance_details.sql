alter table public.guest_profiles
  add column if not exists agreed_fee text,
  add column if not exists planned_song_count integer,
  add column if not exists backup_song_count integer,
  add column if not exists appearance_notes text;
