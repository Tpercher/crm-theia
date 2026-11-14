# Architecture

## Pile

- Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript.
- PostgreSQL 16 via `postgres` (requêtes paramétrées, sans ORM). Le SQL des migrations est la seule source de vérité du schéma.
- Validation des entrées avec Zod. Hash des mots de passe avec argon2id (`@node-rs/argon2`).

## Isolation multi-tenant

1. Chaque table métier a `org_id` et une politique RLS `org_id = app.current_org()`, avec `FORCE ROW LEVEL SECURITY`.
2. Le code ouvre une transaction par opération avec `withTenant(orgId, userId, fn)`, qui fixe `app.org_id` et `app.user_id` (`set_config(..., true)`, donc limités à la transaction).
3. L'application se connecte avec un rôle membre de `crm_app`, sans droits de propriétaire. Au démarrage, elle refuse un rôle superutilisateur ou `BYPASSRLS`.
4. Les clés étrangères internes sont composites (`org_id`, `id`). Une fiche ne peut donc pas pointer vers une fiche d'une autre organisation, même par erreur de code. C'est nécessaire, car les contrôles de clé étrangère ne passent pas par la RLS.
5. Les hashes de mot de passe ne sont lisibles que par une fonction `SECURITY DEFINER` (`app.auth_find_user`), pas par le rôle applicatif.

Les tests `tests/rls.test.ts` vérifient chacun de ces points.

## Permissions

La matrice ressource × action × portée (`true`, `team`, `own`, `false`) reprend celle du prototype (`src/server/permissions.ts`). Elle est vérifiée côté serveur à chaque opération. Une liste ne renvoie que les fiches visibles pour la portée de consultation du rôle. Une suppression groupée est refusée en entier si une seule fiche n'est pas autorisée.

## Données et historique

- La déduplication passe par des index uniques partiels (`contacts(org_id, email)`, `companies(org_id, domain)`).
- Chaque champ modifié produit une ligne `record_history` (ancienne valeur, nouvelle valeur, source, auteur, date). Les sources prévues sont `manual`, `import`, `enrichment:<fournisseur>` et `workflow`.
- `audit_events` est en ajout seul pour l'application (`UPDATE` et `DELETE` révoqués).

## Sécurité, en l'état

- Cookie de session `httpOnly`, `SameSite=Lax`, `Secure` en production. Seul le hash SHA-256 du jeton est stocké.
- Les Server Actions de Next.js vérifient l'en-tête `Origin` (protection CSRF).
- Au-delà de 10 échecs en 15 minutes, un email ne peut plus se connecter.
- Pas encore fait : double authentification, réinitialisation du mot de passe, vérification de l'email, SSO. Une bibliothèque d'authentification éprouvée pourra être évaluée à ce moment-là.
- Les secrets des intégrations seront stockés chiffrés côté serveur, par organisation, et jamais exposés au navigateur.
