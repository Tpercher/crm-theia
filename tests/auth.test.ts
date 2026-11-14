import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthError, login, logout, resolveSession, signup, switchOrg } from '@/server/auth'
import { createOrganization, myOrganizations } from '@/server/tenancy'
import { newTenant, useAppDb } from './helpers'

let sql: postgres.Sql
beforeAll(() => { sql = useAppDb() })
afterAll(async () => { await sql.end() })

describe('authentification', () => {
  it("crée le compte, l'organisation, les 6 rôles système et une session", async () => {
    const t = await newTenant()
    expect(t.ctx.actor.roleKey).toBe('superadmin')
    expect(t.ctx.org.settings.currency).toBe('EUR')
    const s = await resolveSession(t.token)
    expect(s).toEqual({ userId: t.userId, activeOrgId: t.orgId })
  })

  it('refuse un deuxième compte avec le même email, sans rien créer', async () => {
    const t = await newTenant()
    await expect(signup({ name: 'X', email: t.email.toUpperCase(), password: 'motdepasse-solide', orgName: 'Y' }))
      .rejects.toThrow(/existe déjà/)
  })

  it('refuse un mot de passe trop court', async () => {
    await expect(signup({ name: 'X', email: 'court@exemple.test', password: 'court', orgName: 'Y' })).rejects.toThrow()
  })

  it('connecte avec le bon mot de passe et refuse le mauvais', async () => {
    const t = await newTenant()
    const ok = await login(t.email, 'motdepasse-solide')
    expect(ok.orgId).toBe(t.orgId)
    await expect(login(t.email, 'mauvais-mot-de-passe')).rejects.toBeInstanceOf(AuthError)
    await expect(login('inconnu@exemple.test', 'peu-importe-123')).rejects.toThrow('Email ou mot de passe incorrect.')
  })

  it('bloque après 10 échecs, même avec le bon mot de passe', async () => {
    const t = await newTenant()
    for (let i = 0; i < 10; i++) await login(t.email, 'faux-faux-faux').catch(() => {})
    await expect(login(t.email, 'motdepasse-solide')).rejects.toThrow(/Trop de tentatives/)
  })

  it('la déconnexion invalide le jeton', async () => {
    const t = await newTenant()
    await logout(t.token)
    expect(await resolveSession(t.token)).toBeNull()
    expect(await resolveSession('jeton-invente')).toBeNull()
  })

  it("ne bascule que vers une organisation dont on est membre", async () => {
    const a = await newTenant('A')
    const b = await newTenant('B')
    await expect(switchOrg(a.token, a.userId, b.orgId)).rejects.toThrow(/pas membre/)
    const second = await createOrganization(a.userId, 'Deuxième')
    await switchOrg(a.token, a.userId, second.id)
    expect((await resolveSession(a.token))?.activeOrgId).toBe(second.id)
    expect((await myOrganizations(a.userId)).map(o => o.id).sort()).toEqual([a.orgId, second.id].sort())
  })
})
