alter table public.songs
  add column if not exists notes text,
  add column if not exists lyrics text;

update public.songs as song
set
  notes = coalesce(song.notes, legacy_song_library.notes),
  lyrics = coalesce(song.lyrics, legacy_song_library.lyrics)
from public.song_library as legacy_song_library
where legacy_song_library.id = song.id;

update public.songs as song
set
  notes = coalesce(song.notes, legacy_submission.notes),
  lyrics = coalesce(song.lyrics, legacy_submission.lyrics)
from public.pending_submissions as legacy_submission
where legacy_submission.id = song.id
  and lower(coalesce(legacy_submission.submitted_by_role, '')) in ('band', 'admin');

update public.songs as song
set
  notes = coalesce(song.notes, legacy_setlist_song.notes),
  lyrics = coalesce(song.lyrics, legacy_setlist_song.lyrics)
from public.setlist_songs as legacy_setlist_song
where legacy_setlist_song.id = song.id
  and lower(coalesce(legacy_setlist_song.source_role, '')) <> 'guest';
