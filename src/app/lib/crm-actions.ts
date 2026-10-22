'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError, z } from 'zod'
import { create, DuplicateError, NotFoundError, type ObjectKey, OBJECTS, remove, update } from '@/server/crm/objects'
import { ForbiddenError } from '@/server/permissions'
import { requireContext } from './session'

// values : saisie renvoyée en cas d'erreur, pour que le formulaire ne la perde pas.
export type RecordState = { ok?: string; error?: string; duplicateId?: string | null; values?: Record<string, string>; at?: number } | undefined

function objKey(v: string): ObjectKey {
  if (!(v in OBJECTS)) throw new Error('Objet inconnu.')
  return v as ObjectKey
}

function toState(e: unknown, input?: Record<string, string>): RecordState {
  const at = Date.now()
  if (e instanceof DuplicateError) return { error: e.message, duplicateId: e.existingId, values: input, at }
  if (e instanceof ForbiddenError || e instanceof NotFoundError) return { error: e.message, values: input, at }
  if (e instanceof ZodError) return { error: z.prettifyError(e), values: input, at }
  throw e
}

// Seuls les champs présents dans le formulaire sont transmis.
function values(form: FormData) {
  const out: Record<string, string> = {}
  for (const [k, v] of form) if (!k.startsWith('$') && typeof v === 'string') out[k] = v
  return out
}

export async function createRecordAction(obj: string, _: RecordState, form: FormData): Promise<RecordState> {
  const ctx = await requireContext()
  const key = objKey(obj)
  const input = values(form)
  let id: string
  try {
    id = (await create(ctx, key, input)).id
  } catch (e) {
    return toState(e, input)
  }
  revalidatePath(`/${key}`)
  redirect(`/${key}/${id}`)
}

export async function updateRecordAction(obj: string, id: string, _: RecordState, form: FormData): Promise<RecordState> {
  const ctx = await requireContext()
  const key = objKey(obj)
  const input = values(form)
  try {
    await update(ctx, key, id, input)
  } catch (e) {
    return toState(e, input)
  }
  revalidatePath(`/${key}/${id}`)
  return { ok: 'Modifications enregistrées.', at: Date.now() }
}

export async function deleteRecordAction(obj: string, id: string, _: RecordState): Promise<RecordState> {
  const ctx = await requireContext()
  const key = objKey(obj)
  try {
    await remove(ctx, key, [id])
  } catch (e) {
    return toState(e)
  }
  revalidatePath(`/${key}`)
  redirect(`/${key}`)
}
