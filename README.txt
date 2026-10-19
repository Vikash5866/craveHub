CRAVEHUB BURGER POINT POS - VERSION 1

FEATURES
- Tap menu items to add them to a bill; quantities and totals update instantly.
- Small/large menu prices supported; burgers and momos use one price.
- Save orders with a database-assigned order number, timestamp, optional customer/token, line items and total.
- Order history, search, individual order detail, delete, and CSV export.
- Shared order history and daily/all-time sales summaries through Supabase.
- Staff sign-in; an internet connection is required to save and load orders.

MENU PRICES INCLUDED FROM YOUR MENU IMAGE
Chowmein 30/60; Paneer Chowmein 45/90; Fried Rice 30/60; Manchurian 30/60; Dry Manchurian 35/70; Paneer Chilli 60/110; Dry Paneer Chilli 60/110.
Combo: Fried Rice Manchurian 30/60; Chowmein Manchurian 30/60; Paneer Chilli Rice 60/120; Paneer Chilli Chowmein 60/120.
Burger: Veg 40; Paneer 50; Cheese 60. Momos: Veg 20; Paneer 30.

DATABASE SETUP
1. Run supabase_setup.sql in the Supabase SQL Editor.
2. Disable public sign-ups in Supabase Authentication settings and manually create staff users under Authentication > Users.
3. app.js contains this project's Supabase Project URL and publishable key. Never put a Supabase secret key in the app.
4. Deploy this folder to Netlify or another HTTPS static host. Sign in with a staff account to use the database.

On first sign-in, orders in that browser's old local storage are imported. This does not import local orders from other devices. Order numbers are assigned by the database and are not reused when orders are deleted. Keep regular CSV backups.

IMPORTANT
This package is an installable web app project, not a compiled APK. Android SDK/Gradle are not installed in the build environment, so a signed APK could not be compiled here. To install as an app without APK: host this folder on HTTPS, open its URL in Chrome on Android, tap menu (three dots), then Install app / Add to Home screen. To build an APK, wrap this web app in a Trusted Web Activity (Bubblewrap/PWABuilder) or Android WebView project and build/sign it with Android Studio.

Run locally for testing: use any static web server in this folder; service worker/offline install requires localhost or HTTPS. Database access requires internet connectivity.
