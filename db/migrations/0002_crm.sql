-- CRM central : entreprises, contacts et historique des valeurs.
-- Les clés étrangères internes sont composites (org_id, id) : une ligne ne peut
-- jamais pointer vers un enregistrement d'une autre organisation, même si
-- l'application se trompe d'identifiant (les contrôles de clé étrangère
-- contournent la RLS, d'où cette double protection).

create table companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 300),
  domain citext check (domain is null or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  industry text,
  size_range text,
  country text,
  city text,
  owner_id uuid,
  team_id uuid,
  origin text not null default 'manual' check (origin in ('inbound', 'outbound', 'import', 'manual', 'api')),
  props jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, owner_id) references memberships(org_id, user_id) on delete set null (owner_id),
  foreign key (org_id, team_id) references teams(org_id, id) on delete set null (team_id)
);
-- Déduplication garantie par la base : un domaine par organisation.
create unique index companies_org_domain_uq on companies(org_id, domain) where domain is not null;
create index companies_org_name_idx on companies(org_id, lower(name));

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  first_name text,
  last_name text,
  email citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  job_title text,
  company_id uuid,
  owner_id uuid,
  team_id uuid,
  lifecycle_stage text not null default 'subscriber'
    check (lifecycle_stage in ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'other')),
  origin text not null default 'manual' check (origin in ('inbound', 'outbound', 'import', 'manual', 'api')),
  consent_status text not null default 'unknown' check (consent_status in ('unknown', 'opt_in', 'opt_out')),
  props jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  unique (org_id, id),
  check (coalesce(first_name, last_name, email) is not null),
  foreign key (org_id, company_id) references companies(org_id, id) on delete set null (company_id),
  foreign key (org_id, owner_id) references memberships(org_id, user_id) on delete set null (owner_id),
  foreign key (org_id, team_id) references teams(org_id, id) on delete set null (team_id)
);
create unique index contacts_org_email_uq on contacts(org_id, email) where email is not null;
create index contacts_org_company_idx on contacts(org_id, company_id);

create trigger companies_touch before update on companies for each row execute function app.touch_updated_at();
create trigger contacts_touch before update on contacts for each row execute function app.touch_updated_at();

-- Historique champ par champ, alimenté par l'application (source = manual,
-- import, enrichment:<fournisseur>, workflow…).
create table record_history (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  object text not null,
  record_id uuid not null,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'manual',
  actor_id uuid references users(id) on delete set null,
  at timestamptz not null default now()
);
create index record_history_record_idx on record_history(org_id, object, record_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['companies', 'contacts', 'record_history'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (org_id = app.current_org()) with check (org_id = app.current_org())', t);
  end loop;
end $$;

grant select, insert, update, delete on companies, contacts to crm_app;
grant select, insert on record_history to crm_app;
grant usage on sequence record_history_id_seq to crm_app;
