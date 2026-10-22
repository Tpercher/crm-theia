import { logoutAction, switchOrgAction } from '../lib/auth-actions'
import { requireContext } from '../lib/session'
import { myOrganizations } from '@/server/tenancy'
import { Nav } from '../ui/nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext()
  const orgs = await myOrganizations(ctx.user.id)
  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-head">
          <div className="logo" aria-hidden>CA</div>
          <div className="org" title={ctx.org.name}>{ctx.org.name}</div>
        </div>
        <Nav />
        <div className="rail-foot">
          <div>{ctx.user.name} <span className="tag">{ctx.roleName}</span></div>
          {orgs.length > 1 && (
            <form action={switchOrgAction} className="row">
              <label className="muted" htmlFor="orgId">Organisation</label>
              <select className="input" id="orgId" name="orgId" defaultValue={ctx.org.id}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button className="btn" type="submit">Changer</button>
            </form>
          )}
          <form action={logoutAction}><button className="link-btn" type="submit">Se déconnecter</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
