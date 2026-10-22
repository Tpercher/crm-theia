import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest'
import { create, DuplicateError, get, list, remove, update } from '@/server/crm/objects'
import { ForbiddenError } from '@/server/permissions'
import { loadContext } from '@/server/tenancy'
import { newTenant, useAppDb } from './helpers'

let sql: postgres.Sql
let owner: postgres.Sql
beforeAll(() => {
  sql = useAppDb()
  owner = postgres(inject('ownerUrl'), { max: 1, onnotice: () => {} })
})
afterAll(async () => { await sql.end(); await owner.end() })

// Ajoute un utilisateur existant à une organisation avec un rôle donné.
async function member(orgId: string, roleKey: string) {
  const u = await newTenant('Perso')
  const [role] = await owner`select id from roles where org_id = ${orgId} and key = ${roleKey}`
  await owner`insert into memberships (org_id, user_id, role_id) values (${orgId}, ${u.userId}, ${role.id})`
  const ctx = await loadContext(u.userId, orgId)
  if (!ctx) throw new Error('membre introuvable')
  return ctx
}

describe('CRM central', () => {
  it('crée, normalise et retrouve par recherche', async () => {
    const t = await newTenant()
    const c = await create(t.ctx, 'companies', { name: 'Logipro', domain: 'https://www.Logipro.fr/contact' })
    expect(c.domain).toBe('logipro.fr')
    const p = await create(t.ctx, 'contacts', { first_name: 'Julie', email: ' Julie.Dubois@Logipro.FR ', company_id: c.id })
    expect(p.email).toBe('julie.dubois@logipro.fr')
    expect(p.owner_id).toBe(t.userId)
    expect((await list(t.ctx, 'contacts', { q: 'dubois' })).total).toBe(1)
    expect((await list(t.ctx, 'contacts', { q: '%' })).total).toBe(0)
  })

  it("bloque un doublon sans écraser l'existant et indique lequel", async () => {
    const t = await newTenant()
    const first = await create(t.ctx, 'contacts', { first_name: 'Original', email: 'dup@exemple.test' })
    const err = await create(t.ctx, 'contacts', { first_name: 'Copie', email: 'DUP@exemple.test' }).catch(e => e)
    expect(err).toBeInstanceOf(DuplicateError)
    expect(err.existingId).toBe(first.id)
    expect((await get(t.ctx, 'contacts', first.id)).row.first_name).toBe('Original')
    expect((await list(t.ctx, 'contacts')).total).toBe(1)
  })

  it('le même email peut exister dans deux organisations différentes', async () => {
    const a = await newTenant('A')
    const b = await newTenant('B')
    await create(a.ctx, 'contacts', { email: 'partage@exemple.test' })
    await expect(create(b.ctx, 'contacts', { email: 'partage@exemple.test' })).resolves.toBeTruthy()
  })

  it('journalise chaque champ modifié, avec ancienne et nouvelle valeur', async () => {
    const t = await newTenant()
    const c = await create(t.ctx, 'contacts', { first_name: 'Paul', job_title: 'CTO' })
    await update(t.ctx, 'contacts', c.id, { job_title: 'CEO', first_name: 'Paul' })
    const { row, history } = await get(t.ctx, 'contacts', c.id)
    expect(row.job_title).toBe('CEO')
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ field: 'job_title', old_value: 'CTO', new_value: 'CEO', source: 'manual' })
  })

  it('refuse une modification qui créerait un doublon', async () => {
    const t = await newTenant()
    await create(t.ctx, 'companies', { name: 'A', domain: 'a.test' })
    const b = await create(t.ctx, 'companies', { name: 'B', domain: 'b.test' })
    await expect(update(t.ctx, 'companies', b.id, { domain: 'A.test' })).rejects.toBeInstanceOf(DuplicateError)
    expect((await get(t.ctx, 'companies', b.id)).row.domain).toBe('b.test')
  })

  it('rejette les valeurs invalides', async () => {
    const t = await newTenant()
    await expect(create(t.ctx, 'contacts', { email: 'pas-un-email' })).rejects.toThrow()
    await expect(create(t.ctx, 'contacts', {})).rejects.toThrow(/au moins un nom/)
    await expect(create(t.ctx, 'companies', { name: 'X', domain: 'nodomain' })).rejects.toThrow()
  })
})

describe('permissions côté serveur', () => {
  it('un Lecteur consulte mais ne crée pas', async () => {
    const t = await newTenant()
    await create(t.ctx, 'contacts', { email: 'lu@exemple.test' })
    const viewer = await member(t.orgId, 'viewer')
    expect((await list(viewer, 'contacts')).total).toBe(1)
    await expect(create(viewer, 'contacts', { email: 'non@exemple.test' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("un Sales ne modifie que ses propres contacts", async () => {
    const t = await newTenant()
    const sales = await member(t.orgId, 'sales')
    const theirs = await create(t.ctx, 'contacts', { email: 'admin@exemple.test' })
    const mine = await create(sales, 'contacts', { email: 'sales@exemple.test' })
    await expect(update(sales, 'contacts', theirs.id, { job_title: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(update(sales, 'contacts', mine.id, { job_title: 'x' })).resolves.toBeTruthy()
    await expect(remove(sales, 'contacts', [mine.id])).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('la suppression est tout ou rien', async () => {
    const t = await newTenant()
    const mkt = await member(t.orgId, 'marketing')
    const a = await create(t.ctx, 'contacts', { email: 'a@exemple.test' })
    await expect(remove(mkt, 'contacts', [a.id])).rejects.toBeInstanceOf(ForbiddenError)
    const b = await create(t.ctx, 'contacts', { email: 'b@exemple.test' })
    await expect(remove(t.ctx, 'contacts', [a.id, b.id, '00000000-0000-0000-0000-000000000000'])).rejects.toThrow(/introuvable/)
    expect((await list(t.ctx, 'contacts')).total).toBe(2)
    expect(await remove(t.ctx, 'contacts', [a.id, b.id])).toBe(2)
  })

  it("un membre désactivé perd l'accès", async () => {
    const t = await newTenant()
    const v = await member(t.orgId, 'viewer')
    await owner`update memberships set status = 'disabled' where user_id = ${v.user.id} and org_id = ${t.orgId}`
    expect(await loadContext(v.user.id, t.orgId)).toBeNull()
  })
})
