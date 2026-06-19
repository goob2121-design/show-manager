alter table public.mc_special_segments
  add column if not exists anchor_sponsor_read_id uuid references public.mc_sponsor_reads(id) on delete set null;

create index if not exists mc_special_segments_anchor_sponsor_read_id_idx
  on public.mc_special_segments(anchor_sponsor_read_id);
