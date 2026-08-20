alter table public.manual_email_history
  drop constraint if exists manual_email_history_template_key_check;

alter table public.manual_email_history
  add constraint manual_email_history_template_key_check
  check (template_key in (
    'general',
    'complimentary_tickets',
    'reserved_seating',
    'sponsor_message',
    'show_information',
    'custom',
    'ticket_discount'
  ));
