// Organisations (tenants), adhésions et contexte d'exécution d'une requête.
import { randomBytes, randomUUID } from 'node:crypto'
import { type Tx, withTenant, withUser } from './db'
import { type Actor, type Permissions, rolePreset, SYSTEM_ROLES } from './permissions'

export type OrgSettings = { currency: string; timezone: string; locale: string }
export const DEFAULT_SETTINGS: OrgSettings = { currency: 'EUR', timezone: 'Europe/Paris', locale: 'fr-FR' }

export function slugify(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org'
  return `${base.length < 2 ? base + '-org' : base}-${randomBytes(3).toString('hex')}`
}

export async function audit(tx: Tx, actorId: string | null, action: string, object?: string | null, recordId?: string | null, data: Record<string, unknown> = {}) {
  await tx`insert into audit_events (org_id, actor_id, action, object, record_id, data)
    values (app.current_org(), ${actorId}, ${action}, ${object ?? null}, ${recordId ?? null}, ${tx.json(data as never)})`
}

// À appeler dans une transaction où app.user_id = userId. Fixe app.org_id sur
// la nouvelle organisation pour le reste de la transaction.
export async function createOrganizationTx(tx: Tx, userId: string, name: string) {
  const id = randomUUID()
  await tx`select set_config('app.org_id', ${id}, true)`
  await tx`insert into organizations (id, name, slug, settings, created_by)
    values (${id}, ${name.trim()}, ${slugify(name)}, ${tx.json(DEFAULT_SETTINGS)}, ${userId})`
  let superId = ''
  for (const r of SYSTEM_ROLES) {
    const [row] = await tx<{ id: string }[]>`insert into roles (org_id, key, name, system, permissions)
      values (${id}, ${r.key}, ${r.name}, true, ${tx.json(rolePreset(r.key) as never)}) returning id`
    if (r.key === 'superadmin') superId = row.id
  }
  await tx`insert into memberships (org_id, user_id, role_id) values (${id}, ${userId}, ${superId})`
  await audit(tx, userId, 'org.create', 'organization', id, { name })
  return { id }
}

export async function createOrganization(userId: string, name: string) {
  return withUser(userId, tx => createOrganizationTx(tx, userId, name))
}

export type Context = {
  user: { id: string; name: string; email: string }
  org: { id: string; name: string; slug: string; settings: OrgSettings }
  actor: Actor
  roleName: string
}

// Charge le contexte d'une requête. Renvoie null si l'utilisateur n'est pas
// (ou plus) membre actif de l'organisation.
export async function loadContext(userId: string, orgId: string): Promise<Context | null> {
  return withTenant(orgId, userId, async tx => {
    const [row] = await tx<{
      name: string; email: string; org_name: string; slug: string; settings: OrgSettings
      role_key: string; role_name: string; permissions: Permissions
    }[]>`
      select u.name, u.email, o.name as org_name, o.slug, o.settings, r.key as role_key, r.name as role_name, r.permissions
      from memberships m
      join users u on u.id = m.user_id
      join organizations o on o.id = m.org_id
      join roles r on r.id = m.role_id and r.org_id = m.org_id
      where m.org_id = ${orgId} and m.user_id = ${userId} and m.status = 'active'`
    if (!row) return null
    const teams = await tx<{ team_id: string }[]>`select team_id from team_members where user_id = ${userId}`
    return {
      user: { id: userId, name: row.name, email: row.email },
      org: { id: orgId, name: row.org_name, slug: row.slug, settings: { ...DEFAULT_SETTINGS, ...row.settings } },
      actor: { userId, roleKey: row.role_key, permissions: row.permissions, teamIds: teams.map(t => t.team_id) },
      roleName: row.role_name,
    }
  })
}

export async function myOrganizations(userId: string) {
  return withUser(userId, tx => tx<{ id: string; name: string }[]>`
    select o.id, o.name from memberships m join organizations o on o.id = m.org_id
    where m.user_id = ${userId} and m.status = 'active' order by o.name`)
}

export async function listMembers(ctx: Context) {
  return withTenant(ctx.org.id, ctx.user.id, tx => tx<{
    user_id: string; name: string; email: string; role_key: string; role_name: string; status: string; created_at: Date
  }[]>`
    select m.user_id, u.name, u.email, r.key as role_key, r.name as role_name, m.status, m.created_at
    from memberships m join users u on u.id = m.user_id join roles r on r.id = m.role_id and r.org_id = m.org_id
    order by u.name`)
}
