// Authentification par email et mot de passe, sessions opaques en base.
// Le cookie contient un jeton aléatoire ; seul son hash SHA-256 est stocké.
import { hash, verify } from '@node-rs/argon2'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { pgCode, raw, withUser } from './db'
import { createOrganizationTx } from './tenancy'

export const SESSION_DAYS = 30
const MAX_FAILURES = 10
const FAILURE_WINDOW = '15 minutes'

// Hash calculé une fois, utilisé quand l'email est inconnu pour que la durée
// de réponse ne révèle pas l'existence d'un compte.
let dummyHash: Promise<string> | null = null

export const passwordSchema = z.string()
  .min(10, { error: 'Le mot de passe doit faire au moins 10 caractères.' })
  .max(200, { error: 'Le mot de passe est trop long.' })

export const signupSchema = z.object({
  name: z.string().trim().min(1, { error: 'Indique ton nom.' }).max(200),
  email: z.email({ error: 'Adresse email invalide.' }).trim().toLowerCase(),
  password: passwordSchema,
  orgName: z.string().trim().min(1, { error: "Indique le nom de l'organisation." }).max(200),
})

export class AuthError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthError' }
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest()
}

async function newSession(userId: string, orgId: string | null, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const sql = await raw()
  await sql`insert into sessions (id_hash, user_id, active_org_id, expires_at, user_agent)
    values (${hashToken(token)}, ${userId}, ${orgId}, now() + ${SESSION_DAYS + ' days'}::interval, ${userAgent?.slice(0, 300) ?? null})`
  return token
}

export async function signup(input: z.input<typeof signupSchema>, userAgent?: string) {
  const data = signupSchema.parse(input)
  const userId = randomUUID()
  const passwordHash = await hash(data.password)
  let orgId: string
  try {
    // Utilisateur, organisation, rôles et adhésion : tout ou rien.
    orgId = await withUser(userId, async tx => {
      await tx`insert into users (id, email, name, password_hash) values (${userId}, ${data.email}, ${data.name}, ${passwordHash})`
      return (await createOrganizationTx(tx, userId, data.orgName)).id
    })
  } catch (e) {
    if (pgCode(e).constraint === 'users_email_key') throw new AuthError('Un compte existe déjà avec cette adresse.')
    throw e
  }
  const token = await newSession(userId, orgId, userAgent)
  return { userId, orgId, token }
}

export async function login(emailInput: string, password: string, userAgent?: string) {
  const email = String(emailInput ?? '').trim().toLowerCase()
  const sql = await raw()
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from login_failures where email = ${email} and at > now() - ${FAILURE_WINDOW}::interval`
  if (n >= MAX_FAILURES) throw new AuthError('Trop de tentatives. Réessaie dans quelques minutes.')

  const [user] = await sql<{ id: string; password_hash: string }[]>`select * from app.auth_find_user(${email})`
  dummyHash ??= hash(randomBytes(16).toString('hex'))
  const ok = await verify(user?.password_hash ?? await dummyHash, String(password ?? '')).catch(() => false)
  if (!user || !ok) {
    await sql`insert into login_failures (email) values (${email})`
    throw new AuthError('Email ou mot de passe incorrect.')
  }
  await sql`delete from login_failures where email = ${email}`
  const orgId = await withUser(user.id, async tx => {
    await tx`update users set last_login_at = now() where id = ${user.id}`
    const [m] = await tx<{ org_id: string }[]>`
      select org_id from memberships where user_id = ${user.id} and status = 'active' order by created_at limit 1`
    return m?.org_id ?? null
  })
  return { userId: user.id, orgId, token: await newSession(user.id, orgId, userAgent) }
}

export async function resolveSession(token: string | undefined | null) {
  if (!token) return null
  const sql = await raw()
  const [s] = await sql<{ user_id: string; active_org_id: string | null }[]>`
    select * from app.auth_session_user(${hashToken(token)})`
  if (!s) return null
  return { userId: s.user_id, activeOrgId: s.active_org_id }
}

export async function logout(token: string | undefined | null) {
  if (!token) return
  const sql = await raw()
  await sql`delete from sessions where id_hash = ${hashToken(token)}`
}

// Change l'organisation active, uniquement vers une organisation dont
// l'utilisateur est membre actif.
export async function switchOrg(token: string, userId: string, orgId: string) {
  const isMember = await withUser(userId, async tx => {
    const rows = await tx`select 1 from memberships where user_id = ${userId} and org_id = ${orgId} and status = 'active'`
    return rows.length > 0
  })
  if (!isMember) throw new AuthError("Tu n'es pas membre de cette organisation.")
  const sql = await raw()
  await sql`update sessions set active_org_id = ${orgId} where id_hash = ${hashToken(token)} and user_id = ${userId}`
}
