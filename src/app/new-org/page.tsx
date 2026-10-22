import { redirect } from 'next/navigation'
import { logoutAction } from '../lib/auth-actions'
import { getSession } from '../lib/session'
import { NewOrgForm } from '../ui/auth-forms'

export default async function NewOrgPage() {
  if (!(await getSession())) redirect('/login')
  return (
    <main className="auth"><div className="card">
      <h1 style={{ marginBottom: 8 }}>Aucune organisation active</h1>
      <p className="muted">Ton accès a pu être retiré. Tu peux créer une nouvelle organisation.</p>
      <NewOrgForm />
      <form action={logoutAction}><button className="link-btn" type="submit">Se déconnecter</button></form>
    </div></main>
  )
}
