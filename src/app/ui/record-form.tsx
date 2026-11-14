'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import type { FieldDef } from '@/server/crm/fields'
import { createRecordAction, deleteRecordAction, type RecordState, updateRecordAction } from '../lib/crm-actions'

export type Option = { id: string; label: string }

function Notice({ obj, state }: { obj: string; state: RecordState }) {
  if (!state) return null
  if (state.error) {
    return (
      <div className="notice bad" role="alert">
        {state.error}{' '}
        {state.duplicateId && <Link href={`/${obj}/${state.duplicateId}`}>Ouvrir l&apos;enregistrement existant</Link>}
      </div>
    )
  }
  return state.ok ? <div className="notice good" role="status">{state.ok}</div> : null
}

function Input({ f, value, companies, owners, disabled }: {
  f: FieldDef; value: unknown; companies: Option[]; owners: Option[]; disabled: boolean
}) {
  const v = value == null ? '' : String(value)
  const common = { className: 'input', id: f.name, name: f.name, defaultValue: v, disabled }
  if (f.kind === 'select') return <select {...common}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  if (f.kind === 'company' || f.kind === 'owner') {
    const opts = f.kind === 'company' ? companies : owners
    return <select {...common}><option value="">—</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
  }
  return <input {...common} type={f.kind === 'email' ? 'email' : f.kind === 'tel' ? 'tel' : 'text'} />
}

export function RecordForm({ obj, fields, record, companies, owners, canEdit, submitLabel }: {
  obj: string; fields: FieldDef[]; record?: Record<string, unknown>; companies: Option[]; owners: Option[]; canEdit: boolean; submitLabel: string
}) {
  const action = record ? updateRecordAction.bind(null, obj, String(record.id)) : createRecordAction.bind(null, obj)
  const [state, formAction, pending] = useActionState(action, undefined)
  // Après une erreur, on réaffiche la saisie (React réinitialise le formulaire
  // après chaque action) ; après un succès, les valeurs enregistrées.
  const current = state?.values ?? record
  return (
    <form action={formAction} key={state?.at ?? 0}>
      <Notice obj={obj} state={state} />
      {fields.map(f => (
        <div className="field" key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          <Input f={f} value={current?.[f.name]} companies={companies} owners={owners} disabled={!canEdit} />
        </div>
      ))}
      {canEdit
        ? <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Enregistrement…' : submitLabel}</button>
        : <p className="muted">Ton rôle ne permet pas de modifier cet enregistrement.</p>}
    </form>
  )
}

export function DeleteButton({ obj, id, label }: { obj: string; id: string; label: string }) {
  const [state, action, pending] = useActionState(deleteRecordAction.bind(null, obj, id), undefined)
  return (
    <form action={action} onSubmit={e => { if (!confirm(`Supprimer définitivement ${label} ? Cette action est irréversible.`)) e.preventDefault() }}>
      <Notice obj={obj} state={state} />
      <button className="btn danger" type="submit" disabled={pending}>Supprimer</button>
    </form>
  )
}
