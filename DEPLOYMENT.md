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
The password recovery flow emails a 6-digit OTP, valid for 10 minutes, and allows up to 5 incorrect attempts. It uses the Resend HTTPS API because Render Free web services block outbound SMTP ports.

Configure these in Render's Environment settings:
- `RESEND_API_KEY`: API key from your Resend account. Keep it private; never commit it or share it in chat.
- `MAIL_FROM`: a sender address verified in Resend, such as `Wanderlust <no-reply@your-verified-domain.com>`.

In Resend, verify a domain you control and use a sender address on that domain for production email delivery. If using a test sender, Resend may restrict recipients to the account owner's verified email address. After adding the variables, save and redeploy/restart the Render service. Ask recipients to check Spam/Junk if the OTP doesn't arrive.

## Inventory scale
The listing page now limits each result page request to 100 records and supports text search and min/max price filters. For very large inventories, add database indexes and cursor/page-based pagination and import verified data from a licensed source. Do not seed millions of fabricated properties.


## Google sign-in

The login and signup forms include a Google sign-in option. To enable it, create a **Web application** OAuth client in Google Cloud Console and add the following environment variables in Render:

- `GOOGLE_CLIENT_ID`: the OAuth client ID from Google Cloud.
- `GOOGLE_CLIENT_SECRET`: the OAuth client secret. Keep it private.
- `GOOGLE_REDIRECT_URI`: `https://parikshit-4kjm.onrender.com/auth/google/callback`.

Add that same callback address under the OAuth client's **Authorized redirect URIs**. Save the variables and redeploy the service. Google sign-in verifies the email address and creates an account on first sign-in; a verified Google email is linked to an existing account with that email.
