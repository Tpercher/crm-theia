// Pages génériques liste / fiche, partagées par les objets CRM.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FIELDS, LABELS } from '@/server/crm/fields'
import { get, list, NotFoundError, type ObjectKey } from '@/server/crm/objects'
import { can } from '@/server/permissions'
import { type Context, listMembers } from '@/server/tenancy'
import { requireContext } from '../lib/session'
import { DeleteButton, type Option, RecordForm } from './record-form'

const PAGE = 50

async function options(ctx: Context) {
  const [members, companies] = await Promise.all([
    listMembers(ctx),
    can(ctx.actor, 'companies', 'view') ? list(ctx, 'companies', { limit: 200 }) : Promise.resolve({ rows: [] }),
  ])
  const owners: Option[] = members.filter(m => m.status === 'active').map(m => ({ id: m.user_id, label: m.name }))
  const comps: Option[] = companies.rows.map(c => ({ id: c.id, label: String(c.name) }))
  return { owners, companies: comps }
}

function display(v: unknown, kind: string, opts: { owners: Option[]; companies: Option[] }, choices?: [string, string][]) {
  if (v == null || v === '') return <span className="muted">—</span>
  if (kind === 'owner') return opts.owners.find(o => o.id === v)?.label ?? <span className="muted">Ancien membre</span>
  if (kind === 'company') return opts.companies.find(o => o.id === v)?.label ?? <span className="muted">—</span>
  if (choices) return choices.find(([k]) => k === v)?.[1] ?? String(v)
  return String(v)
}

function recordTitle(obj: ObjectKey, r: Record<string, unknown>) {
  if (obj === 'companies') return String(r.name)
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || String(r.email ?? 'Sans nom')
}

export async function ListPage({ obj, searchParams }: { obj: ObjectKey; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireContext()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const page = Math.max(1, Number(sp.page) || 1)
  const L = LABELS[obj]
  if (!can(ctx.actor, obj, 'view')) return <div className="notice bad">Ton rôle ne permet pas de consulter les {L.plural.toLowerCase()}.</div>
  const [{ rows, total }, opts] = await Promise.all([list(ctx, obj, { q, limit: PAGE, offset: (page - 1) * PAGE }), options(ctx)])
  const cols = FIELDS[obj].filter(f => f.list)
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (p: number) => `/${obj}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`
  return (
    <>
      <div className="page-head">
        <h1>{L.plural} <span className="muted">({total})</span></h1>
        <div className="row">
          <form className="row" role="search">
            <input className="input" name="q" defaultValue={q} placeholder="Rechercher…" aria-label="Rechercher" style={{ width: 220 }} />
            <button className="btn" type="submit">Rechercher</button>
          </form>
          {can(ctx.actor, obj, 'create') && <Link className="btn primary" href={`/${obj}/new`}>{L.newLabel}</Link>}
        </div>
      </div>
      {rows.length === 0
        ? <div className="card muted">{q ? 'Aucun résultat pour cette recherche.' : `Aucun enregistrement pour l'instant.`}</div>
        : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr>{cols.map(c => <th key={c.name}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    {cols.map((c, i) => (
                      <td key={c.name}>
                        {i === 0 ? <Link href={`/${obj}/${r.id}`}>{display(r[c.name], c.kind, opts, c.options) ?? 'Ouvrir'}</Link> : display(r[c.name], c.kind, opts, c.options)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {pages > 1 && (
        <div className="row" style={{ marginTop: 12 }}>
          {page > 1 && <Link className="btn" href={href(page - 1)}>Précédent</Link>}
          <span className="muted">Page {page} sur {pages}</span>
          {page < pages && <Link className="btn" href={href(page + 1)}>Suivant</Link>}
        </div>
      )}
    </>
  )
}

export async function NewPage({ obj }: { obj: ObjectKey }) {
  const ctx = await requireContext()
  const L = LABELS[obj]
  const opts = await options(ctx)
  return (
    <>
      <div className="page-head"><h1>{L.newLabel}</h1><Link href={`/${obj}`}>Retour à la liste</Link></div>
      <div className="card" style={{ maxWidth: 560 }}>
        <RecordForm obj={obj} fields={FIELDS[obj]} companies={opts.companies} owners={opts.owners}
          canEdit={can(ctx.actor, obj, 'create')} submitLabel="Créer" />
      </div>
    </>
  )
}

const SOURCES: Record<string, string> = { manual: 'Saisie', import: 'Import', workflow: 'Workflow' }

export async function DetailPage({ obj, params }: { obj: ObjectKey; params: Promise<{ id: string }> }) {
  const ctx = await requireContext()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  let data
  try {
    data = await get(ctx, obj, id)
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    throw e
  }
  const opts = await options(ctx)
  const { row, history } = data
  const fields = FIELDS[obj]
  return (
    <>
      <div className="page-head">
        <h1>{recordTitle(obj, row)}</h1>
        <div className="row">
          <Link href={`/${obj}`}>Retour à la liste</Link>
          {can(ctx.actor, obj, 'delete', row) && <DeleteButton obj={obj} id={row.id} label={recordTitle(obj, row)} />}
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h2>Propriétés</h2>
          <RecordForm obj={obj} fields={fields} record={row} companies={opts.companies} owners={opts.owners}
            canEdit={can(ctx.actor, obj, 'edit', row)} submitLabel="Enregistrer" />
        </div>
        <div className="card">
          <h2>Historique</h2>
          {history.length === 0 && <p className="muted">Aucune modification depuis la création.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {history.map((h, i) => {
              const f = fields.find(x => x.name === h.field)
              return (
                <li key={i}>
                  <div><strong>{f?.label ?? h.field}</strong> <span className="tag">{SOURCES[h.source] ?? h.source}</span></div>
                  <div className="muted">
                    {display(h.old_value, f?.kind ?? 'text', opts, f?.options)} → {display(h.new_value, f?.kind ?? 'text', opts, f?.options)}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(h.at).toLocaleString('fr-FR', { timeZone: ctx.org.settings.timezone })} · {opts.owners.find(o => o.id === h.actor_id)?.label ?? 'Inconnu'}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}
