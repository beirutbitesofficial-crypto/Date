create schema if not exists folio_private;

create table if not exists folio_private.users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  slug text not null unique,
  onboarding_complete boolean not null default false,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folio_users_email_lower_idx
  on folio_private.users (lower(email));

create index if not exists folio_users_slug_idx
  on folio_private.users (slug);

create table if not exists folio_private.projects (
  id uuid primary key,
  owner_id uuid not null references folio_private.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folio_projects_owner_created_idx
  on folio_private.projects (owner_id, created_at desc);

-- The folio_private schema is intentionally outside Supabase's default exposed public schema.
-- All access goes through the Node server, not the browser/Data API.
