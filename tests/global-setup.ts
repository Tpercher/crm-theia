// Crée une base jetable, applique les migrations avec le rôle propriétaire,
// puis crée un rôle de connexion limité (membre de crm_app) pour l'application.
import postgres from 'postgres'
import { migrate } from '../scripts/migrate'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres@localhost:5433/postgres'

export default async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  const dbName = `crm_test_${process.pid}_${Date.now()}`
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create database ${dbName}`)
  await admin.unsafe(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'crm_web_test') then
      create role crm_web_test login password 'test';
    end if; end $$`)
  const ownerUrl = withDb(ADMIN_URL, dbName)
  await migrate(ownerUrl, undefined, () => {})
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
  await owner.unsafe('grant crm_app to crm_web_test')
  await owner.end()
  const u = new URL(withDb(ADMIN_URL, dbName))
  u.username = 'crm_web_test'
  u.password = 'test'
  provide('appUrl', u.toString())
  provide('ownerUrl', ownerUrl)
  return async () => {
    await admin.unsafe(`drop database if exists ${dbName} with (force)`)
    await admin.end()
  }
}

function withDb(url: string, db: string) {
  const u = new URL(url)
  u.pathname = '/' + db
  return u.toString()
}

declare module 'vitest' {
  export interface ProvidedContext { appUrl: string; ownerUrl: string }
}
