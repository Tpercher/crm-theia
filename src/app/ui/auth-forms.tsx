'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { type FormState, loginAction, newOrgAction, signupAction } from '../lib/auth-actions'

function Errors({ state, name }: { state: FormState; name: string }) {
  const errs = state?.fields?.[name]
  return errs ? <span className="muted" style={{ color: 'var(--bad)' }}>{errs.join(' ')}</span> : null
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined)
  return (
    <form action={action} key={state?.at ?? 0}>
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required autoFocus defaultValue={state?.values?.email} /></div>
      <div className="field"><label htmlFor="password">Mot de passe</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="btn primary" disabled={pending} type="submit">{pending ? 'Connexion…' : 'Se connecter'}</button>
      <p className="muted">Pas encore de compte ? <Link href="/signup">Créer une organisation</Link></p>
    </form>
  )
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined)
  return (
    <form action={action} key={state?.at ?? 0}>
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <div className="field"><label htmlFor="name">Ton nom</label><input className="input" id="name" name="name" autoComplete="name" required autoFocus defaultValue={state?.values?.name} /><Errors state={state} name="name" /></div>
      <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} /><Errors state={state} name="email" /></div>
      <div className="field"><label htmlFor="password">Mot de passe (10 caractères minimum)</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /><Errors state={state} name="password" /></div>
      <div className="field"><label htmlFor="orgName">Nom de l&apos;organisation</label><input className="input" id="orgName" name="orgName" required defaultValue={state?.values?.orgName} /><Errors state={state} name="orgName" /></div>
      <button className="btn primary" disabled={pending} type="submit">{pending ? 'Création…' : 'Créer mon compte'}</button>
      <p className="muted">Déjà inscrit ? <Link href="/login">Se connecter</Link></p>
    </form>
  )
}

export function NewOrgForm() {
  const [state, action, pending] = useActionState(newOrgAction, undefined)
  return (
    <form action={action}>
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <div className="field"><label htmlFor="orgName">Nom de l&apos;organisation</label><input className="input" id="orgName" name="orgName" required autoFocus /></div>
      <button className="btn primary" disabled={pending} type="submit">Créer</button>
    </form>
  )
}
