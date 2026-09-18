# FolioOne

FolioOne is a lightweight portfolio builder for freelancers. It turns a guided professional survey plus project uploads into a polished public one-page portfolio.

## What is included

- Account registration and login
- Guided freelancer profile / onboarding survey
- Role and discipline selection for designers, editors, developers, creators and more
- Skills, services, languages, experience, bio and contact links
- Avatar upload
- Project manager with image/video uploads
- Client, year, category, tools, story and external project links
- Public share URL: `/u/:slug`
- Responsive one-page public portfolio
- JSON persistence with atomic writes
- Stateless signed login cookie

## Run locally

```bash
npm install
SESSION_SECRET="replace-with-a-long-random-secret" npm start
```

Open http://localhost:3000

## Environment variables

- `PORT` — supplied automatically by most Node hosting providers
- `SESSION_SECRET` — **required for production**; use a long random value
- `NODE_ENV=production` — recommended in production

## Persistent storage

Profiles and project metadata are stored in `data/data.json`.
Uploaded images/videos are stored in `uploads/`.

On hosting platforms that use ephemeral filesystems, attach persistent storage or migrate these two areas to object storage/database before production. On a traditional persistent Node hosting environment, make sure both folders remain writable and are not reset during deployments.

## Legacy Date project

The previous Date project is preserved in the branch:

`legacy-date-backup-2026-09-18`

Nothing from the old project needs to be deleted to recover it; switch to that branch at any time.
