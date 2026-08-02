alter table public.sponsor_library
  add column if not exists contact_person text,
  add column if not exists contact_title text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists mobile_phone text,
  add column if not exists preferred_contact_method text not null default 'none',
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists legal_name text,
  add column if not exists recognition_name text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists standard_sponsorship_amount numeric,
  add column if not exists is_in_kind boolean not null default false,
  add column if not exists in_kind_description text,
  add column if not exists sponsor_since_year integer,
  add column if not exists renewal_date date,
  add column if not exists notes text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists preferred_contact_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sponsor_library_preferred_contact_method_check'
      and conrelid = 'public.sponsor_library'::regclass
  ) then
    alter table public.sponsor_library
      add constraint sponsor_library_preferred_contact_method_check
      check (preferred_contact_method in ('email', 'phone', 'text', 'none'));
  end if;
end
$$;
