'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Les espaces pas encore construits dans cette version sont affichés comme
// « prévu », sans lien.
const NAV: { sec: string; items: { href?: string; label: string }[] }[] = [
  { sec: 'CRM', items: [{ href: '/contacts', label: 'Contacts' }, { href: '/companies', label: 'Entreprises' }, { label: 'Leads' }, { label: 'Opportunités' }] },
  { sec: 'Acquisition', items: [{ label: 'Inbound' }, { label: 'Outbound' }, { label: 'Data Lab' }, { label: 'Automatisations' }] },
  { sec: 'Administration', items: [{ href: '/settings', label: 'Paramètres' }] },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav aria-label="Navigation principale">
      {NAV.map(s => (
        <div key={s.sec}>
          <div className="nav-sec">{s.sec}</div>
          {s.items.map(i => i.href
            ? <Link key={i.label} className="nav-item" href={i.href} aria-current={path.startsWith(i.href) ? 'page' : undefined}>{i.label}</Link>
            : <span key={i.label} className="nav-item planned">{i.label} <span className="tag">prévu</span></span>)}
        </div>
      ))}
    </nav>
  )
}
