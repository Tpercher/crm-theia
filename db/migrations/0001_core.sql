-- Socle multi-tenant : utilisateurs, sessions, organisations, rôles, équipes, audit.
--
-- Isolation : chaque table métier porte org_id et une politique RLS qui la
-- limite à l'organisation fixée par la transaction (app.org_id). L'application
-- se connecte avec le rôle crm_app, qui n'est ni propriétaire des tables ni
-- BYPASSRLS ; FORCE ROW LEVEL SECURITY couvre aussi le propriétaire.

create extension if not exists citext;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'crm_app') then
    create role crm_app nologin;
  end if;
end $$;

create schema app;
grant usage on schema app to crm_app;

create function app.current_org() returns uuid
  language sql stable as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;
create function app.current_user_id() returns uuid
  language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- Utilisateurs : globaux (un utilisateur peut appartenir à plusieurs organisations).
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null check (length(name) between 1 and 200),
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Sessions : seul le hash SHA-256 du jeton est stocké.
create table sessions (
  id_hash bytea primary key,
  user_id uuid not null references users(id) on delete cascade,
  active_org_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

-- Échecs de connexion, pour limiter les essais par adresse.
create table login_failures (
  email citext not null,
  at timestamptz not null default now()
);
create index login_failures_email_at_idx on login_failures(email, at desc);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  slug citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null
);
alter table sessions add foreign key (active_org_id) references organizations(id) on delete set null;

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(name) between 1 and 80),
  system boolean not null default false,
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, key),
  unique (org_id, id)
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (org_id, role_id) references roles(org_id, id)
);
create index memberships_user_idx on memberships(user_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (org_id, id)
);

create table team_members (
  org_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  primary key (team_id, user_id),
  foreign key (org_id, team_id) references teams(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references memberships(org_id, user_id) on delete cascade
);

create table audit_events (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  object text,
  record_id uuid,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_events_org_at_idx on audit_events(org_id, at desc);

-- RLS ------------------------------------------------------------------------

alter table organizations enable row level security;
alter table organizations force row level security;
create policy org_member_read on organizations for select using (
  id = app.current_org()
  or exists (select 1 from memberships m where m.org_id = organizations.id and m.user_id = app.current_user_id() and m.status = 'active')
);
create policy org_write on organizations for insert with check (id = app.current_org());
create policy org_update on organizations for update using (id = app.current_org()) with check (id = app.current_org());

alter table memberships enable row level security;
alter table memberships force row level security;
-- Un utilisateur voit ses propres adhésions (sélecteur d'organisation) et
-- toutes celles de l'organisation courante.
create policy membership_read on memberships for select using (org_id = app.current_org() or user_id = app.current_user_id());
create policy membership_write on memberships for insert with check (org_id = app.current_org());
create policy membership_update on memberships for update using (org_id = app.current_org()) with check (org_id = app.current_org());
create policy membership_delete on memberships for delete using (org_id = app.current_org());

alter table users enable row level security;
alter table users force row level security;
create policy user_read on users for select using (
  id = app.current_user_id()
  or exists (select 1 from memberships m where m.user_id = users.id and m.org_id = app.current_org())
);
create policy user_insert on users for insert with check (id = app.current_user_id());
create policy user_update on users for update using (id = app.current_user_id()) with check (id = app.current_user_id());

do $$
declare t text;
begin
  foreach t in array array['roles', 'teams', 'team_members', 'audit_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (org_id = app.current_org()) with check (org_id = app.current_org())', t);
  end loop;
end $$;

-- Le journal d'audit est en ajout seul pour l'application.
revoke update, delete on audit_events from crm_app;

-- Fonctions d'authentification (SECURITY DEFINER) : elles lisent les hashes
-- de mot de passe sans donner à crm_app un accès général à cette colonne.
create function app.auth_find_user(p_email citext) returns table (id uuid, password_hash text)
  language sql stable security definer set search_path = public, pg_temp
  as $$ select u.id, u.password_hash from users u where u.email = p_email $$;

create function app.auth_session_user(p_hash bytea) returns table (user_id uuid, active_org_id uuid, expires_at timestamptz)
  language sql stable security definer set search_path = public, pg_temp
  as $$ select s.user_id, s.active_org_id, s.expires_at from sessions s where s.id_hash = p_hash and s.expires_at > now() $$;

revoke all on function app.auth_find_user(citext) from public;
revoke all on function app.auth_session_user(bytea) from public;
grant execute on function app.auth_find_user(citext), app.auth_session_user(bytea) to crm_app;

-- Droits de crm_app ------------------------------------------------------------

grant select (id, email, name, created_at, last_login_at), insert, update (name, password_hash, last_login_at) on users to crm_app;
grant select, insert, update, delete on sessions to crm_app;
grant select, insert, delete on login_failures to crm_app;
grant select, insert, update on organizations to crm_app;
grant select, insert, update, delete on roles, memberships, teams, team_members to crm_app;
grant select, insert on audit_events to crm_app;
grant usage on sequence audit_events_id_seq to crm_app;
