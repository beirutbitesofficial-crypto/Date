# FolioOne

FolioOne is a professional portfolio builder for freelancers. A freelancer completes a guided onboarding survey, adds projects from phone/desktop or external work platforms, and gets a polished public one-page portfolio at `/u/:slug`.

## Main product flow

1. Create an account.
2. Complete the professional survey.
3. Upload projects from phone/computer or import project links.
4. Connect Google Drive with the Google Picker and select files directly from the freelancer's Drive.
5. Publish or hide individual projects.
6. Preview and share one clean portfolio link.

## Freelancer profile

- Full name, position, discipline and location
- Birthday with optional public visibility
- Experience, bio, skills, services and languages
- Profile photo
- WhatsApp / phone
- Public professional contact email
- Availability status
- Public/private portfolio switch
- Accent color
- Website, Instagram, LinkedIn, Behance, Dribbble, GitHub, YouTube, Vimeo, Figma, Canva, Notion and TikTok

## Projects

- Title, category, client, year, project story and tools
- Direct phone/desktop image and video upload
- Upload progress percentage with a separate secure-processing state
- Up to 8 files per request; production limit is configurable with `MAX_UPLOAD_MB`
- Google Drive Picker multi-select
- Paste/import links from Google Drive, Dropbox, YouTube, Vimeo, Behance, Dribbble, GitHub, Figma, Canva and Notion
- Embedded YouTube, Vimeo and public Google Drive previews when supported
- Edit project metadata and add more media later
- Feature a project
- Publish/hide a project without deleting it
- Delete a project and its uploaded cloud media

## Public portfolio

- Responsive single-page portfolio
- Selected work, About, Skills, Services and Contact sections
- Project image/video galleries
- Embedded external project sources
- Contact email / WhatsApp / social links
- Dynamic page title, description, canonical URL and Open Graph metadata
- Public/private portfolio control

## Production architecture

Local development can still use `data/data.json` and `uploads/`.

Production supports:

- PostgreSQL for users and projects
- Private database schema (`folio_private`) so portfolio tables are not exposed through a public Data API
- Supabase Storage for persistent image/video media
- Security headers with Helmet
- API and authentication rate limiting
- Same-origin protection on state-changing API requests
- Secure HTTP-only session cookies
- Stronger password hashing and 10-character minimum passwords
- Graceful server shutdown
- `/healthz` and `/readyz` health checks
- GitHub Actions syntax checks
- Docker deployment

Run `sql/schema.sql` on the production PostgreSQL database before enabling strict production mode.

## Google Drive setup

Google Drive Picker needs three public configuration values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_API_KEY`
- `GOOGLE_APP_ID`

In Google Cloud:

1. Enable **Google Picker API** and **Google Drive API**.
2. Create an OAuth 2.0 Web client.
3. Add the production website under Authorized JavaScript origins.
4. Create an API key and restrict it to the production website and required Google APIs.
5. Put the Google Cloud project number in `GOOGLE_APP_ID`.

The app requests the privacy-focused `drive.file` scope and uses Picker list mode. Selected Drive items are added to the project as Drive sources. Portfolio visitors can only preview Drive content they have permission to access, so files intended for a public portfolio should have suitable sharing permissions.

## Environment

Copy `.env.example` into the hosting environment and configure it there. Do not commit real secrets.

Key production variables:

- `APP_URL`
- `SESSION_SECRET`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET`
- Google Picker values above
- `REQUIRE_PRODUCTION_SERVICES=true` after database/storage are configured

## Run locally

```bash
npm install
SESSION_SECRET="local-development-secret-only" npm start
```

Open http://localhost:3000

## Production checklist

See `PRODUCTION_CHECKLIST.md`.

## Legacy Date project

The original Date project is safely preserved in:

`legacy-date-backup-2026-09-18`

Switch to that branch at any time to restore the previous concept.
