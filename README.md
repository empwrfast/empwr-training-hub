# empwr-training-hub
EMPWR SGPT training hub: TV screen and lift logging

## Member login (Nov 2026)
- `me.html`: member portal. Current members sign in with a 6-digit email code and see their own progress only.
- `auth.js`: shared sign-in. iPad, Coach Board and TV sign in once with the EMPWR device email (info@empwrfast.com).
- iPad: members tap their name, then a 4-digit PIN (set on first use). Coaches reset PINs on the Coach Board.

Go-live order (do not skip):
1. Supabase: Auth > SMTP settings, add custom SMTP (built-in email only reaches project team members).
2. Supabase: Auth > Email Templates, put `{{ .Token }}` in both "Magic Link" and "Confirm signup" so members get a 6-digit code (first sign-in uses Confirm signup).
3. Supabase SQL editor: run `sql/01_login_setup.sql` (changes nothing for the gym yet).
4. Add member emails (`sgpt.members.email`).
5. Push these pages. Sign in the iPad, Coach Board laptop and TV computer once with info@empwrfast.com.
6. Run `sql/02_lock_down.sql`. Emergency: `sql/03_undo_lock_down.sql` reopens everything.
