-- Preserve old library-level live performance notes by copying them into setlist entries once.
-- Going forward, performance_flow and song_intro_notes are show-specific fields on setlist_entries.
update public.setlist_entries entry
set performance_flow = song.performance_flow
from public.songs song
where entry.source_type = 'library'
  and entry.song_id = song.id
  and nullif(btrim(coalesce(entry.performance_flow, '')), '') is null
  and nullif(btrim(coalesce(song.performance_flow, '')), '') is not null;

update public.setlist_entries entry
set song_intro_notes = song.song_intro_notes
from public.songs song
where entry.source_type = 'library'
  and entry.song_id = song.id
  and nullif(btrim(coalesce(entry.song_intro_notes, '')), '') is null
  and nullif(btrim(coalesce(song.song_intro_notes, '')), '') is not null;