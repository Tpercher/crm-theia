import { can, RESOURCES } from '@/server/permissions'
import { listMembers } from '@/server/tenancy'
import { requireContext } from '../../lib/session'

export default async function SettingsPage() {
  const ctx = await requireContext()
  const members = can(ctx.actor, 'users', 'view') ? await listMembers(ctx) : null
  return (
    <>
      <div className="page-head"><h1>Paramètres</h1></div>
      <div className="grid2">
        <div className="card">
          <h2>Membres</h2>
          {!members
            ? <p className="muted">Ton rôle ne permet pas de consulter les membres.</p>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th></tr></thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.user_id}>
                        <td>{m.name}</td><td>{m.email}</td><td>{m.role_name}</td>
                        <td>{m.status === 'active' ? 'Actif' : 'Désactivé'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <p className="muted">Les invitations par email et la gestion des rôles arrivent dans une prochaine version.</p>
        </div>
        <div className="card">
          <h2>Organisation</h2>
          <p>{ctx.org.name} <span className="muted mono">{ctx.org.slug}</span></p>
          <p className="muted">Devise {ctx.org.settings.currency} · fuseau {ctx.org.settings.timezone}</p>
          <h2 style={{ marginTop: 16 }}>Ton rôle : {ctx.roleName}</h2>
          <p className="muted">Accès en consultation : {Object.entries(RESOURCES).filter(([r]) => can(ctx.actor, r as keyof typeof RESOURCES, 'view')).map(([, l]) => l).join(', ') || 'aucun'}.</p>
        </div>
      </div>
    </>
  )
}
