'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { AuthError, login, logout, signup, signupSchema, switchOrg } from '@/server/auth'
import { createOrganization } from '@/server/tenancy'
import { clearToken, getSession, readToken, userAgent, writeToken } from './session'

export type FormState = { error?: string; fields?: Record<string, string[] | undefined>; values?: Record<string, string>; at?: number } | undefined

// Champs renvoyés après une erreur (jamais le mot de passe).
function keep(form: FormData, names: string[]) {
  return Object.fromEntries(names.map(n => [n, String(form.get(n) ?? '')]))
}

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors, values: keep(form, ['name', 'email', 'orgName']), at: Date.now() }
  try {
    const res = await signup(parsed.data, await userAgent())
    await writeToken(res.token)
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values: keep(form, ['name', 'email', 'orgName']), at: Date.now() }
    throw e
  }
  redirect('/contacts')
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const res = await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''), await userAgent())
    await writeToken(res.token)
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values: keep(form, ['email']), at: Date.now() }
    throw e
  }
  redirect('/contacts')
}

export async function logoutAction() {
  await logout(await readToken())
  await clearToken()
  redirect('/login')
}

export async function switchOrgAction(form: FormData) {
  const s = await getSession()
  const token = await readToken()
  if (!s || !token) redirect('/login')
  await switchOrg(token, s.userId, String(form.get('orgId') ?? ''))
  redirect('/contacts')
}

export async function newOrgAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession()
  const token = await readToken()
  if (!s || !token) redirect('/login')
  const name = String(form.get('orgName') ?? '').trim()
  if (!name) return { error: "Indique le nom de l'organisation." }
  const org = await createOrganization(s.userId, name)
  await switchOrg(token, s.userId, org.id)
  redirect('/contacts')
}
