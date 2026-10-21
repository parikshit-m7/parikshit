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

## Forgot-password email OTP
The password recovery flow emails a 6-digit OTP, valid for 10 minutes, and allows up to 5 incorrect attempts. Configure these in Render's Environment settings:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER`: the Gmail address that will send recovery codes.
- `SMTP_PASS`: a Google App Password for that account (not the normal Gmail password).
- `MAIL_FROM`: sender address, for example `Wanderlust <your-sending-address@gmail.com>`.

For Gmail, enable 2-Step Verification on the sending Google account, then create an App Password in Google Account security settings. Keep the App Password private and never commit it to GitHub or send it in chat. After saving these environment variables in Render, redeploy/restart the service. OTP emails cannot be delivered until valid SMTP settings are configured. Ask users to check Spam/Junk if the code doesn't arrive.

## Inventory scale
The listing page now limits each result page request to 100 records and supports text search and min/max price filters. For very large inventories, add database indexes and cursor/page-based pagination and import verified data from a licensed source. Do not seed millions of fabricated properties.
