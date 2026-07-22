# Square Sandbox Phase 1 Test Plan

Phase 1 is sandbox-only and must not send purchaser emails.

## Environment

Required Vercel/server variables:

- `SQUARE_ENVIRONMENT=sandbox`
- `SQUARE_SANDBOX_ACCESS_TOKEN`
- `SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_SANDBOX_WEBHOOK_NOTIFICATION_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- existing Supabase URL variables used by StageFlow

Webhook URL format:

`https://<your-stageflow-domain>/api/integrations/square/webhook`

The value in `SQUARE_SANDBOX_WEBHOOK_NOTIFICATION_URL` must exactly match the Square Sandbox webhook notification URL.

## Checks

1. Invalid signature is rejected
   - POST any JSON body to the webhook with a bad `x-square-hmacsha256-signature`.
   - Expected: HTTP 403 and no ticket row created.

2. Valid completed Sandbox payment is accepted
   - Configure a Square Sandbox webhook for `payment.updated`.
   - Complete a Sandbox payment for a mapped catalog variation.
   - Expected: webhook returns success and `square_ticket_import_events.result` is `imported` or `incomplete_customer`.

3. Unmapped catalog variation is ignored
   - Complete payment for a variation ID not present in `shows.square_catalog_variation_id`.
   - Expected: result `unmapped_item`, no `show_comp_tickets` row.

4. Replayed webhook does not duplicate the sale
   - Re-deliver the same webhook event from Square Sandbox.
   - Expected: no duplicate `show_comp_tickets` row for the same source/payment/order/line item; result may be `duplicate`.

5. Two-ticket order creates `ticket_count = 2`
   - Complete a Sandbox order with quantity 2 for the mapped variation.
   - Expected: one `show_comp_tickets` row with `ticket_count = 2`.

6. Reserved seating link allows exactly two seats
   - Open the generated `/reserved-seating/<selection_token>` link.
   - Expected: no more than 2 seats can be selected.

7. Missing purchaser email imports safely but is flagged
   - Complete a Sandbox payment without a retrievable email.
   - Expected: ticket row is created, result `incomplete_customer`, email sent remains `false`.

8. Existing CSV paid-online imports still work
   - Use the existing Ticket Sales import UI.
   - Expected: imported paid-online rows and reserved seating links behave as before.

9. Existing check-in behavior still works
   - Open Door Mode and check in a paid-online row.
   - Expected: `checked_in_count` increments as before.

10. No purchaser email is sent in Phase 1
   - Confirm `square_ticket_import_events.email_sent = false` for Square imports.
   - Confirm no purchaser email send code is invoked by the webhook.