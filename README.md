# CraveHub POS

CraveHub is an installable point-of-sale web app for a burger and fast-food store. Orders are stored in Supabase and shared between signed-in staff devices.

## Supabase setup

1. In the Supabase project SQL Editor, run [`supabase_setup.sql`](./supabase_setup.sql).
2. In Supabase Authentication settings, disable public sign-ups. Then create staff accounts in Authentication → Users. Staff sign in to the app with those accounts.
3. `app.js` is configured with this project's Project URL and publishable key. The publishable key is intended to be public; never put a Supabase secret key in the app.
4. Deploy the project folder to Netlify (or another HTTPS static host). Sign in to save and view orders; saving requires an internet connection.

On first sign-in, any orders stored in that browser's old local storage are imported into Supabase. This migration does not copy data from other devices. Order numbers are assigned by the database and are not reused after deleting orders.

Row Level Security restricts order access to authenticated users. Keep public sign-ups disabled and add staff accounts manually.
