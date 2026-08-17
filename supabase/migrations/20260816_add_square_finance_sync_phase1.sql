alter table public.shows
  add column if not exists square_finance_sync_enabled boolean not null default false,
  add column if not exists square_finance_sync_started_at timestamptz;

alter table public.show_finance_items
  add column if not exists source text,
  add column if not exists source_kind text,
  add column if not exists external_payment_id text,
  add column if not exists external_order_id text,
  add column if not exists external_line_item_uid text,
  add column if not exists currency text,
  add column if not exists original_amount_cents bigint,
  add column if not exists occurred_at timestamptz,
  add column if not exists imported_at timestamptz,
  add column if not exists is_system_managed boolean not null default false;

create unique index if not exists show_finance_items_square_gross_sale_unique
  on public.show_finance_items(
    source,
    source_kind,
    show_id,
    external_payment_id,
    external_order_id,
    external_line_item_uid
  );
create or replace function public.prevent_system_managed_finance_item_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.is_system_managed then
    raise exception 'System-managed Finance items are read-only.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_system_managed_finance_item_update on public.show_finance_items;
create trigger prevent_system_managed_finance_item_update
  before update on public.show_finance_items
  for each row execute function public.prevent_system_managed_finance_item_mutation();

drop trigger if exists prevent_system_managed_finance_item_delete on public.show_finance_items;
create trigger prevent_system_managed_finance_item_delete
  before delete on public.show_finance_items
  for each row execute function public.prevent_system_managed_finance_item_mutation();
