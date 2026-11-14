// Lien entre le cookie de session et le contexte serveur.
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { resolveSession, SESSION_DAYS } from '@/server/auth'
import { loadContext } from '@/server/tenancy'

export const COOKIE = 'crm_session'

export async function readToken() {
  return (await cookies()).get(COOKIE)?.value ?? null
}

export async function writeToken(token: string) {
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  })
}

export async function clearToken() {
  ;(await cookies()).delete(COOKIE)
}

export async function userAgent() {
  return (await headers()).get('user-agent') ?? undefined
}

export const getSession = cache(async () => resolveSession(await readToken()))

export const getContext = cache(async () => {
  const s = await getSession()
  if (!s?.activeOrgId) return null
  return loadContext(s.userId, s.activeOrgId)
})

// Pour les pages de l'application : redirige si la session ou
// l'organisation active manque.
export async function requireContext() {
  const s = await getSession()
  if (!s) redirect('/login')
  const ctx = await getContext()
  if (!ctx) redirect('/new-org')
  return ctx
}
