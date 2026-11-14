import { redirect } from 'next/navigation'
import { getSession } from '../lib/session'
import { LoginForm } from '../ui/auth-forms'

export default async function LoginPage() {
  if (await getSession()) redirect('/contacts')
  return <main className="auth"><div className="card"><h1 style={{ marginBottom: 16 }}>Connexion</h1><LoginForm /></div></main>
}
