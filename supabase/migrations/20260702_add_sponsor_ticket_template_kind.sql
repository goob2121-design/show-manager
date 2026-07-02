alter table public.sponsor_ticket_templates
  add column if not exists template_kind text not null default 'sponsor';

create index if not exists sponsor_ticket_templates_show_kind_created_at_idx
  on public.sponsor_ticket_templates(show_id, template_kind, created_at desc);
