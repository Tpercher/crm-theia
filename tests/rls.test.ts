import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest'
import { create, get, list, NotFoundError } from '@/server/crm/objects'
import { setDb, withTenant } from '@/server/db'
import { newTenant, useAppDb } from './helpers'

let sql: postgres.Sql
beforeAll(() => { sql = useAppDb() })
afterAll(async () => { await sql.end() })

describe('isolation entre organisations', () => {
  it("une organisation ne voit ni ne lit les données d'une autre", async () => {
    const a = await newTenant('A')
    const b = await newTenant('B')
    const ca = await create(a.ctx, 'contacts', { first_name: 'Alice', email: 'alice@a.test' })
    expect((await list(b.ctx, 'contacts')).total).toBe(0)
    await expect(get(b.ctx, 'contacts', ca.id)).rejects.toBeInstanceOf(NotFoundError)
    // Même avec une requête SQL directe, la RLS filtre.
    const rows = await withTenant(b.orgId, b.userId, tx => tx`select id from contacts where id = ${ca.id}`)
    expect(rows).toHaveLength(0)
  })

  it("refuse d'écrire une ligne au nom d'une autre organisation", async () => {
    const a = await newTenant('A')
    const b = await newTenant('B')
    await expect(withTenant(b.orgId, b.userId, tx =>
      tx`insert into contacts (org_id, email) values (${a.orgId}, 'x@x.test')`)).rejects.toThrow(/row-level security/)
  })

  it("refuse de lier un contact à l'entreprise d'une autre organisation", async () => {
    const a = await newTenant('A')
    const b = await newTenant('B')
    const comp = await create(a.ctx, 'companies', { name: 'Acme', domain: 'acme.test' })
    await expect(create(b.ctx, 'contacts', { email: 'bob@b.test', company_id: comp.id })).rejects.toThrow(/foreign key/)
  })

  it('sans organisation fixée, aucune donnée métier n\'est visible', async () => {
    const a = await newTenant('A')
    await create(a.ctx, 'contacts', { email: 'visible@a.test' })
    const rows = await sql`select count(*)::int as n from contacts`
    expect(rows[0].n).toBe(0)
    const users = await sql`select count(*)::int as n from users`
    expect(users[0].n).toBe(0)
  })

  it("le rôle applicatif ne peut pas lire les hashes de mot de passe", async () => {
    const a = await newTenant('A')
    await expect(withTenant(a.orgId, a.userId, tx => tx`select password_hash from users`)).rejects.toThrow(/permission denied/)
  })

  it("le journal d'audit ne peut pas être modifié par l'application", async () => {
    const a = await newTenant('A')
    await expect(withTenant(a.orgId, a.userId, tx => tx`delete from audit_events`)).rejects.toThrow(/permission denied/)
  })

  it('refuse de fonctionner avec un rôle superutilisateur', async () => {
    const owner = postgres(inject('ownerUrl'), { max: 1, onnotice: () => {} })
    setDb(owner)
    await expect(withTenant('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', async () => 1))
      .rejects.toThrow(/BYPASSRLS/)
    await owner.end()
    setDb(sql)
  })
})
