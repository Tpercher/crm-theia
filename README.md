# CRM Acquisition

CRM marketing et prospection en SaaS multi-clients : un CRM central (façon HubSpot) et des tables de travail flexibles pour l'acquisition (façon Clay).

Cette première version pose le socle. Elle comprend :

- des **organisations isolées** : chaque client a ses données, cloisonnées par PostgreSQL (Row Level Security) et pas seulement par le code ;
- des **comptes** avec email et mot de passe (argon2id), des sessions en base, une limite d'essais de connexion et le changement d'organisation ;
- **6 rôles système** (Superadministrateur, Administrateur, RevOps, Marketing / Growth, Sales, Lecteur), avec des permissions vérifiées côté serveur pour toutes, ses équipes ou ses propres fiches ;
- des **contacts et entreprises** : création, recherche, fiche, modification avec historique champ par champ, suppression confirmée ;
- une **déduplication imposée par la base** (email par organisation, domaine par organisation) : un doublon est refusé, rien n'est écrasé, et l'interface propose d'ouvrir l'existant ;
- un **journal d'audit** en ajout seul.

Ce qui n'est pas encore fait apparaît comme « prévu » dans la navigation : leads, opportunités, Inbound, Outbound, Data Lab, automatisations, invitations et gestion des rôles, enrichissement (FullEnrich, Pipecorn, scraper maison) et emailing interne. Voir [docs/ROADMAP.md](docs/ROADMAP.md).

## Démarrer en local

Prérequis : Node 22+ et PostgreSQL 16.

```bash
npm install
createdb crm
# Migrations avec le rôle propriétaire du schéma
MIGRATION_DATABASE_URL=postgres://postgres@localhost:5432/crm npm run db:migrate
# Rôle de connexion de l'application, limité par la RLS
psql -d crm -c "create role crm_web login password 'dev'; grant crm_app to crm_web;"
DATABASE_URL=postgres://crm_web:dev@localhost:5432/crm npm run dev
```

Ouvre http://localhost:3000/signup pour créer un compte et une organisation.

## Tests

```bash
TEST_DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
```

Les tests créent une base jetable, appliquent les migrations, puis vérifient l'isolation entre organisations, l'authentification, la déduplication, l'historique et les permissions. La CI GitHub Actions exécute typecheck, tests et build.

## Architecture

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
