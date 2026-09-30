-- Rehearsal details may optionally belong to one exact show performance.
-- Existing rows remain valid and unlinked until the application can safely match them.
alter table public.rehearsal_entries
  add column if not exists setlist_entry_id uuid
    references public.setlist_entries(id)
    on delete set null;

create index if not exists rehearsal_entries_show_id_setlist_entry_id_idx
  on public.rehearsal_entries(show_id, setlist_entry_id);
