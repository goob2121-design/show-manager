# Door Staff accounts

Door Staff passwords are stored only as scrypt hashes. After applying the
`20260809_create_door_staff_accounts.sql` migration, create an account as follows.

1. Generate a password hash locally:

   ```powershell
   node scripts/hash-door-staff-password.mjs "use-a-long-unique-password"
   ```

2. Copy the resulting `scrypt$...` value and run this statement in the Supabase
   SQL editor, replacing the three placeholders:

   ```sql
   insert into public.door_staff_accounts (username, password_hash, show_id)
   select '<username>', '<scrypt hash>', id
   from public.shows
   where slug = '<show slug>';
   ```

Each account belongs to one show. Set `is_active = false` to prevent login
without deleting the account. Never store or paste the plaintext password into
the database.
