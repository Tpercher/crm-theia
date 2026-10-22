// Modèle de permissions, repris du prototype. Chaque rôle associe à une
// ressource et une action une portée : true (tout), 'team', 'own' ou false.
// Ce contrôle est appliqué côté serveur avant chaque lecture ou écriture.

export const RESOURCES = {
  contacts: 'Contacts',
  companies: 'Entreprises',
  leads: 'Leads',
  deals: 'Opportunités',
  activities: 'Activités',
  tasks: 'Tâches',
  campaigns: 'Campagnes',
  dltables: 'Tables (Data Lab, Outbound)',
  views: 'Vues partagées',
  exports: 'Exports',
  settings: 'Paramètres globaux',
  users: 'Utilisateurs et accès',
  audit: "Journal d'audit",
  integrations: 'Intégrations',
} as const

export const ACTIONS = {
  view: 'Consulter',
  create: 'Créer',
  edit: 'Modifier',
  delete: 'Supprimer',
  import: 'Importer',
  export: 'Exporter',
  run: 'Exécuter',
  manage: 'Gérer',
} as const

export type Resource = keyof typeof RESOURCES
export type Action = keyof typeof ACTIONS
export type Scope = boolean | 'team' | 'own'
export type Permissions = Partial<Record<Resource, Partial<Record<Action, Scope>>>>

export type RoleKind = 'superadmin' | 'admin' | 'revops' | 'marketing' | 'sales' | 'viewer'

export const SYSTEM_ROLES: { key: RoleKind; name: string }[] = [
  { key: 'superadmin', name: 'Superadministrateur' },
  { key: 'admin', name: 'Administrateur' },
  { key: 'revops', name: 'RevOps' },
  { key: 'marketing', name: 'Marketing / Growth' },
  { key: 'sales', name: 'Sales' },
  { key: 'viewer', name: 'Lecteur' },
]

const ALL_RESOURCES = Object.keys(RESOURCES) as Resource[]
const ALL_ACTIONS = Object.keys(ACTIONS) as Action[]
const CRM: Resource[] = ['contacts', 'companies', 'leads', 'deals', 'activities', 'tasks', 'campaigns']

function fill(v: Scope): Permissions {
  const p: Permissions = {}
  for (const r of ALL_RESOURCES) p[r] = Object.fromEntries(ALL_ACTIONS.map(a => [a, v]))
  return p
}

export function rolePreset(kind: RoleKind): Permissions {
  if (kind === 'superadmin' || kind === 'admin') return fill(true)
  const p = fill(false)
  const set = (rs: Resource[], as: Action[], v: Scope) => rs.forEach(r => as.forEach(a => { p[r]![a] = v }))
  if (kind === 'revops') {
    set(CRM, ['view', 'create', 'edit', 'delete', 'import', 'export'], true)
    set(['dltables'], ['view', 'create', 'edit', 'delete', 'import', 'export', 'run'], true)
    set(['views'], ['view', 'create', 'edit', 'delete'], true)
    set(['exports'], ['export'], true)
    set(['settings', 'users', 'audit', 'integrations'], ['view'], true)
  }
  if (kind === 'marketing') {
    set(CRM, ['view'], true)
    set(['contacts', 'companies', 'leads', 'campaigns', 'activities', 'tasks'], ['create', 'edit', 'import'], true)
    set(['contacts', 'companies', 'leads'], ['export'], 'team')
    set(['dltables'], ['view', 'create', 'edit', 'import', 'run'], true)
    set(['dltables'], ['delete', 'export'], 'own')
    set(['views'], ['view', 'create'], true)
    set(['views'], ['edit', 'delete'], 'own')
    set(['exports'], ['export'], 'team')
  }
  if (kind === 'sales') {
    set(CRM, ['view'], true)
    set(['contacts', 'companies', 'deals', 'activities', 'tasks'], ['create'], true)
    set(['contacts', 'companies', 'leads', 'deals', 'activities', 'tasks'], ['edit'], 'own')
    set(['dltables'], ['view'], true)
    set(['views'], ['view', 'create'], true)
    set(['views'], ['edit', 'delete'], 'own')
  }
  if (kind === 'viewer') {
    set(CRM, ['view'], true)
    set(['dltables', 'views'], ['view'], true)
  }
  return p
}

export type Actor = {
  userId: string
  roleKey: string
  permissions: Permissions
  teamIds: string[]
}

export type OwnedRecord = { owner_id?: string | null; team_id?: string | null; created_by?: string | null }

// Sans enregistrement, une portée 'team' ou 'own' autorise l'action en
// général ; elle est ensuite vérifiée sur chaque enregistrement.
export function can(actor: Actor, resource: Resource, action: Action, rec?: OwnedRecord): boolean {
  if (actor.roleKey === 'superadmin') return true
  const v = actor.permissions[resource]?.[action]
  if (v === true) return true
  if (!v) return false
  if (!rec) return true
  const mine = rec.owner_id === actor.userId || (!rec.owner_id && rec.created_by === actor.userId)
  if (v === 'own') return mine
  return mine || (!!rec.team_id && actor.teamIds.includes(rec.team_id))
}

export class ForbiddenError extends Error {
  constructor(resource: Resource, action: Action, onRecord: boolean) {
    super(`Action refusée : votre rôle ne permet pas « ${ACTIONS[action]} » sur ${RESOURCES[resource]}${onRecord ? ' pour cet enregistrement' : ''}.`)
    this.name = 'ForbiddenError'
  }
}

export function guard(actor: Actor, resource: Resource, action: Action, rec?: OwnedRecord) {
  if (!can(actor, resource, action, rec)) throw new ForbiddenError(resource, action, !!rec)
}

// Nettoie une matrice reçue d'un formulaire : seules les ressources, actions
// et portées connues sont conservées.
export function sanitizePermissions(input: unknown): Permissions {
  const out: Permissions = {}
  if (!input || typeof input !== 'object') return out
  for (const r of ALL_RESOURCES) {
    const row = (input as Record<string, unknown>)[r]
    if (!row || typeof row !== 'object') continue
    out[r] = {}
    for (const a of ALL_ACTIONS) {
      const v = (row as Record<string, unknown>)[a]
      out[r]![a] = v === true || v === 'team' || v === 'own' ? v : false
    }
  }
  return out
}
