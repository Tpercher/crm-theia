import { redirect } from 'next/navigation'
import { getSession } from '../lib/session'
import { SignupForm } from '../ui/auth-forms'

export default async function SignupPage() {
  if (await getSession()) redirect('/contacts')
  return <main className="auth"><div className="card"><h1 style={{ marginBottom: 16 }}>Créer un compte</h1><SignupForm /></div></main>
}
