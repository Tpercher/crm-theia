import postgres from 'postgres'
import { inject } from 'vitest'
import { signup } from '@/server/auth'
import { setDb } from '@/server/db'
import { loadContext } from '@/server/tenancy'

export function useAppDb() {
  const sql = postgres(inject('appUrl'), { max: 4, onnotice: () => {} })
  setDb(sql)
  return sql
}

let n = 0
export async function newTenant(label = 'Org') {
  n += 1
  const email = `user${n}-${Date.now()}@exemple.test`
  const res = await signup({ name: `Utilisateur ${n}`, email, password: 'motdepasse-solide', orgName: `${label} ${n}` })
  const ctx = await loadContext(res.userId, res.orgId)
  if (!ctx) throw new Error('contexte introuvable')
  return { ...res, email, ctx }
}
