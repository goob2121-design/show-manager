alter table public.show_comp_tickets
  add column if not exists door_payment_method text,
  add column if not exists door_unit_price numeric(10,2),
  add column if not exists door_sale_total numeric(10,2);
