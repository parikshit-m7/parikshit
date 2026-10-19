# Wanderlust deployment notes

## Render start command
- Build command: `npm install`
- Start command: `npm start`

## Required environment variables
Keep secrets in Render's Environment settings, never commit them to GitHub:
- `ATLASDB_URL`: MongoDB Atlas connection string for the Wanderlust database.
- `SECRET`: long, random session secret.
- `NODE_ENV`: `production`
- `MAP_TOKEN`: Mapbox public token used for geocoding/maps (optional; map features are graceful without it).
- Cloudinary values already used by `cloudConfig.js`: set the exact variable names referenced by that file.

## Forgot password email
The forgot-password flow requires SMTP credentials before it can send email. Configure these in Render:
- `SMTP_HOST`: SMTP server hostname from your email provider.
- `SMTP_PORT`: usually `587` for STARTTLS or `465` for implicit TLS.
- `SMTP_SECURE`: `false` for 587; `true` for 465.
- `SMTP_USER`: SMTP username.
- `SMTP_PASS`: SMTP password or provider-issued app password.
- `MAIL_FROM`: verified sender address, for example `Wanderlust <verified-address@example.com>`.
- `APP_BASE_URL`: public HTTPS URL of the deployed app, with no trailing slash.

Use a real email provider's SMTP settings; do not use placeholder credentials. Until SMTP is configured, password reset emails will not be sent.

## Inventory scale
The listing page now limits each result page request to 100 records and supports text search and min/max price filters. For very large inventories, add database indexes and cursor/page-based pagination and import verified listing data from a licensed source. Do not seed millions of fabricated properties.

## Gmail SMTP quick setup
For a Gmail mailbox, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and `SMTP_SECURE=true`. Set `SMTP_USER` to the sending Gmail address, `SMTP_PASS` to a Google App Password (not the normal Gmail login password), and `MAIL_FROM` to that same verified sending address. The app's public HTTPS address must be set as `APP_BASE_URL`. Create the App Password in the Google Account security settings after enabling 2-Step Verification. Never commit these values to the repository or share the App Password in chat.
