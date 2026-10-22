// Objets CRM : schémas de validation, normalisation et opérations communes
// (liste, création, modification avec historique, suppression), toutes
// soumises aux permissions du rôle et à l'isolation par organisation.
import { z } from 'zod'
import { pgCode, type Tx, withTenant } from '../db'
import { type Actor, guard, type Resource } from '../permissions'
import { audit, type Context } from '../tenancy'

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)
const text = (max = 300) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable())
const uuid = z.preprocess(emptyToNull, z.uuid().nullable())
const origin = z.enum(['inbound', 'outbound', 'import', 'manual', 'api'])

export function normalizeDomain(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const s = v.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return s === '' ? null : s
}

const contactFields = {
  first_name: text(120),
  last_name: text(120),
  email: z.preprocess(v => (typeof v === 'string' ? emptyToNull(v.trim().toLowerCase()) : v),
    z.email({ error: 'Adresse email invalide.' }).nullable()),
  phone: text(40),
  job_title: text(200),
  company_id: uuid,
  owner_id: uuid,
  team_id: uuid,
  lifecycle_stage: z.enum(['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'other']),
  origin,
  consent_status: z.enum(['unknown', 'opt_in', 'opt_out']),
}

const companyFields = {
  name: z.string().trim().min(1, { error: 'Le nom est obligatoire.' }).max(300),
  domain: z.preprocess(normalizeDomain, z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, { error: 'Domaine invalide.' }).nullable()),
  industry: text(120),
  size_range: text(40),
  country: text(80),
  city: text(120),
  owner_id: uuid,
  team_id: uuid,
  origin,
}

export const OBJECTS = {
  contacts: {
    resource: 'contacts' as Resource,
    label: 'contact',
    create: z.object(contactFields).partial().extend({
      lifecycle_stage: contactFields.lifecycle_stage.default('subscriber'),
      origin: origin.default('manual'),
      consent_status: contactFields.consent_status.default('unknown'),
    }).refine(v => v.first_name || v.last_name || v.email, { error: 'Renseigne au moins un nom ou un email.' }),
    update: z.object(contactFields).partial(),
    search: ['first_name', 'last_name', 'email', 'job_title'],
    dedupe: { contacts_org_email_uq: 'email' },
  },
  companies: {
    resource: 'companies' as Resource,
    label: 'entreprise',
    create: z.object(companyFields).partial().extend({ name: companyFields.name, origin: origin.default('manual') }),
    update: z.object(companyFields).partial(),
    search: ['name', 'domain', 'city'],
    dedupe: { companies_org_domain_uq: 'domain' },
  },
} as const

export type ObjectKey = keyof typeof OBJECTS
export type Row = Record<string, unknown> & { id: string; owner_id: string | null; team_id: string | null; created_by: string | null }

export class DuplicateError extends Error {
  constructor(public object: ObjectKey, public field: string, public existingId: string | null) {
    super(`Un enregistrement avec ${field === 'email' ? 'cet email' : 'ce domaine'} existe déjà. Rien n'a été écrasé.`)
    this.name = 'DuplicateError'
  }
}

export class NotFoundError extends Error {
  constructor() { super('Enregistrement introuvable.'); this.name = 'NotFoundError' }
}

// Restreint une lecture à la portée du rôle ('own' ou 'team').
function visibility(tx: Tx, actor: Actor, resource: Resource) {
  const v = actor.roleKey === 'superadmin' ? true : actor.permissions[resource]?.view
  if (v === true) return tx`true`
  if (v === 'own') return tx`(owner_id = ${actor.userId} or (owner_id is null and created_by = ${actor.userId}))`
  if (v === 'team') {
    return tx`(owner_id = ${actor.userId} or (owner_id is null and created_by = ${actor.userId})
      or team_id = any(${actor.teamIds}::uuid[]))`
  }
  return tx`false`
}

// Traduit une violation d'unicité de déduplication en DuplicateError.
function asDuplicate(obj: ObjectKey, e: unknown): never {
  const { code, constraint } = pgCode(e)
  const field = constraint ? (OBJECTS[obj].dedupe as Record<string, string>)[constraint] : undefined
  if (code === '23505' && field) throw new DuplicateError(obj, field, null)
  throw e
}

export async function list(ctx: Context, obj: ObjectKey, opts: { q?: string; limit?: number; offset?: number } = {}) {
  const def = OBJECTS[obj]
  guard(ctx.actor, def.resource, 'view')
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)
  return withTenant(ctx.org.id, ctx.user.id, async tx => {
    const q = opts.q?.trim()
    const pattern = '%' + (q ?? '').replace(/[\\%_]/g, m => '\\' + m) + '%'
    const search = q
      ? tx`and (${def.search.reduce((acc, c) => tx`${acc} or ${tx(c)}::text ilike ${pattern}`, tx`false`)})`
      : tx``
    const rows = await tx<Row[]>`select * from ${tx(obj)} where ${visibility(tx, ctx.actor, def.resource)} ${search}
      order by updated_at desc, id limit ${limit} offset ${offset}`
    const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from ${tx(obj)}
      where ${visibility(tx, ctx.actor, def.resource)} ${search}`
    return { rows, total }
  })
}

export async function get(ctx: Context, obj: ObjectKey, id: string) {
  const def = OBJECTS[obj]
  guard(ctx.actor, def.resource, 'view')
  return withTenant(ctx.org.id, ctx.user.id, async tx => {
    const [row] = await tx<Row[]>`select * from ${tx(obj)} where id = ${id} and ${visibility(tx, ctx.actor, def.resource)}`
    if (!row) throw new NotFoundError()
    const history = await tx`select field, old_value, new_value, source, actor_id, at from record_history
      where object = ${obj} and record_id = ${id} order by at desc, id desc limit 200`
    return { row, history }
  })
}

export async function findExisting(ctx: Context, obj: ObjectKey, field: string, value: unknown) {
  return withTenant(ctx.org.id, ctx.user.id, async tx => {
    const [row] = await tx<{ id: string }[]>`select id from ${tx(obj)} where ${tx(field)} = ${value as string}`
    return row?.id ?? null
  })
}

export async function create(ctx: Context, obj: ObjectKey, input: unknown) {
  const def = OBJECTS[obj]
  guard(ctx.actor, def.resource, 'create')
  const values = def.create.parse(input) as Record<string, unknown>
  try {
    return await withTenant(ctx.org.id, ctx.user.id, async tx => {
      const insert: Record<string, string | null> = { ...(values as Record<string, string | null>), org_id: ctx.org.id, created_by: ctx.user.id, owner_id: (values.owner_id as string | null | undefined) ?? ctx.user.id }
      const [row] = await tx<Row[]>`insert into ${tx(obj)} ${tx(insert)} returning *`.catch(e => asDuplicate(obj, e))
      await audit(tx, ctx.user.id, `${obj}.create`, obj, row.id)
      return row
    })
  } catch (e) {
    if (e instanceof DuplicateError) e.existingId = await findExisting(ctx, obj, e.field, values[e.field])
    throw e
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Modifie un enregistrement et journalise chaque champ réellement changé.
export async function update(ctx: Context, obj: ObjectKey, id: string, input: unknown, source = 'manual') {
  const def = OBJECTS[obj]
  const patch = def.update.parse(input) as Record<string, unknown>
  try {
    return await withTenant(ctx.org.id, ctx.user.id, async tx => {
      const [cur] = await tx<Row[]>`select * from ${tx(obj)} where id = ${id} for update`
      if (!cur) throw new NotFoundError()
      guard(ctx.actor, def.resource, 'edit', cur)
      const changed = Object.keys(patch).filter(k => !same(cur[k], patch[k]))
      if (changed.length === 0) return cur
      const set = Object.fromEntries(changed.map(k => [k, patch[k]]))
      const [row] = await tx<Row[]>`update ${tx(obj)} set ${tx(set)} where id = ${id} returning *`.catch(e => asDuplicate(obj, e))
      for (const k of changed) {
        await tx`insert into record_history (org_id, object, record_id, field, old_value, new_value, source, actor_id)
          values (${ctx.org.id}, ${obj}, ${id}, ${k}, ${tx.json((cur[k] ?? null) as never)}, ${tx.json((patch[k] ?? null) as never)}, ${source}, ${ctx.user.id})`
      }
      await audit(tx, ctx.user.id, `${obj}.update`, obj, id, { fields: changed })
      return row
    })
  } catch (e) {
    if (e instanceof DuplicateError) e.existingId = await findExisting(ctx, obj, e.field, patch[e.field])
    throw e
  }
}

// Supprime des enregistrements. Tout ou rien : si un seul est refusé, aucun
// n'est supprimé.
export async function remove(ctx: Context, obj: ObjectKey, ids: string[]) {
  const def = OBJECTS[obj]
  guard(ctx.actor, def.resource, 'delete')
  if (ids.length === 0) return 0
  return withTenant(ctx.org.id, ctx.user.id, async tx => {
    const rows = await tx<Row[]>`select id, owner_id, team_id, created_by from ${tx(obj)} where id = any(${ids}::uuid[]) for update`
    if (rows.length !== new Set(ids).size) throw new NotFoundError()
    for (const r of rows) guard(ctx.actor, def.resource, 'delete', r)
    await tx`delete from ${tx(obj)} where id = any(${ids}::uuid[])`
    await audit(tx, ctx.user.id, `${obj}.delete`, obj, null, { ids, count: rows.length })
    return rows.length
  })
}
