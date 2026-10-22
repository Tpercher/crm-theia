// Accès base. Toute lecture ou écriture de données d'une organisation passe par
// withTenant, qui fixe app.org_id / app.user_id pour la transaction : la RLS
// de PostgreSQL filtre alors chaque requête sur cette organisation.
import postgres from 'postgres'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

let client: Sql | null = null
let checked: Promise<void> | null = null

export function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL manquant.')
    client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10), onnotice: () => {} })
  }
  return client
}

export function setDb(sql: Sql | null) {
  client = sql
  checked = null
}

// Refuse de démarrer avec un rôle qui contournerait la RLS.
async function checkRole(sql: Sql) {
  const [r] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    select rolsuper, rolbypassrls from pg_roles where rolname = current_user`
  if (!r || r.rolsuper || r.rolbypassrls) {
    throw new Error("DATABASE_URL utilise un rôle superutilisateur ou BYPASSRLS : l'isolation entre organisations ne serait pas appliquée.")
  }
}

async function ready(): Promise<Sql> {
  const sql = db()
  checked ??= checkRole(sql).catch(e => { checked = null; throw e })
  await checked
  return sql
}

export async function withTenant<T>(orgId: string, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = await ready()
  return sql.begin(async tx => {
    await tx`select set_config('app.org_id', ${orgId}, true), set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}

// Transaction sans organisation : seules les données de l'utilisateur lui-même
// (profil, adhésions) sont visibles.
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = await ready()
  return sql.begin(async tx => {
    await tx`select set_config('app.user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}

export async function raw(): Promise<Sql> {
  return ready()
}

export function pgCode(e: unknown): { code?: string; constraint?: string } {
  const err = e as { code?: string; constraint_name?: string }
  return { code: err?.code, constraint: err?.constraint_name }
}
