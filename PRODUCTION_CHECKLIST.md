# Production checklist

FolioOne is coded to run locally without external infrastructure, but real production should use the production services below.

## Required

1. Create a dedicated PostgreSQL database and run `sql/schema.sql`.
2. Create a **public** Supabase Storage bucket named `folio-media` (or set another name in `SUPABASE_STORAGE_BUCKET`).
3. Configure every value from `.env.example`.
4. Generate a 32+ character `SESSION_SECRET`.
5. Set `APP_URL` to the final HTTPS domain.
6. Set `REQUIRE_PRODUCTION_SERVICES=true` only after the database and cloud storage are connected.
7. Enable Google Picker API and Google Drive API in Google Cloud.
8. Create a Web OAuth client, add the production domain under Authorized JavaScript origins, and set `GOOGLE_CLIENT_ID`.
9. Create/restrict a Google API key for the Picker/Drive APIs and set `GOOGLE_API_KEY`.
10. Set `GOOGLE_APP_ID` to the Google Cloud project number.

## Recommended before public launch

- Transactional email provider for email verification and password reset.
- Error monitoring (for example Sentry) and uptime monitoring.
- Privacy Policy and Terms pages.
- Automated database backups and a restore test.
- CDN/video optimization for very large video portfolios.
- Antivirus/malware scanning if arbitrary file types are ever added later.
- Distributed rate limiting (Redis/Upstash) if the app runs on more than one server instance.
- Analytics for portfolio owners (views, referrers, CTA clicks).
- Optional custom domains for paid users.

## Health checks

- `/healthz` checks that the web process is alive.
- `/readyz` checks database access and reports the configured storage mode.

When `NODE_ENV=production` is set without the required infrastructure, the app logs a production warning. Once everything is configured, set `REQUIRE_PRODUCTION_SERVICES=true` so a bad deployment fails fast instead of silently falling back to local storage.
