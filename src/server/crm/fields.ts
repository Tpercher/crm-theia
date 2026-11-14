// Description des champs affichés dans l'interface, par objet.
import type { ObjectKey } from './objects'

export type FieldDef = {
  name: string
  label: string
  kind: 'text' | 'email' | 'tel' | 'select' | 'company' | 'owner'
  options?: [string, string][]
  list?: boolean
}

const ORIGINS: [string, string][] = [['manual', 'Saisie manuelle'], ['inbound', 'Inbound'], ['outbound', 'Outbound'], ['import', 'Import'], ['api', 'API']]

export const FIELDS: Record<ObjectKey, FieldDef[]> = {
  contacts: [
    { name: 'first_name', label: 'Prénom', kind: 'text', list: true },
    { name: 'last_name', label: 'Nom', kind: 'text', list: true },
    { name: 'email', label: 'Email', kind: 'email', list: true },
    { name: 'phone', label: 'Téléphone', kind: 'tel' },
    { name: 'job_title', label: 'Poste', kind: 'text', list: true },
    { name: 'company_id', label: 'Entreprise', kind: 'company', list: true },
    { name: 'lifecycle_stage', label: 'Cycle de vie', kind: 'select', list: true, options: [
      ['subscriber', 'Abonné'], ['lead', 'Lead'], ['mql', 'MQL'], ['sql', 'SQL'], ['opportunity', 'Opportunité'], ['customer', 'Client'], ['other', 'Autre']] },
    { name: 'origin', label: 'Origine', kind: 'select', list: true, options: ORIGINS },
    { name: 'consent_status', label: 'Consentement', kind: 'select', options: [['unknown', 'Inconnu'], ['opt_in', 'Opt-in'], ['opt_out', 'Opt-out']] },
    { name: 'owner_id', label: 'Propriétaire', kind: 'owner', list: true },
  ],
  companies: [
    { name: 'name', label: 'Nom', kind: 'text', list: true },
    { name: 'domain', label: 'Domaine', kind: 'text', list: true },
    { name: 'industry', label: 'Secteur', kind: 'text', list: true },
    { name: 'size_range', label: 'Taille', kind: 'text' },
    { name: 'country', label: 'Pays', kind: 'text', list: true },
    { name: 'city', label: 'Ville', kind: 'text' },
    { name: 'origin', label: 'Origine', kind: 'select', list: true, options: ORIGINS },
    { name: 'owner_id', label: 'Propriétaire', kind: 'owner', list: true },
  ],
}

export const LABELS: Record<ObjectKey, { plural: string; singular: string; newLabel: string }> = {
  contacts: { plural: 'Contacts', singular: 'Contact', newLabel: 'Nouveau contact' },
  companies: { plural: 'Entreprises', singular: 'Entreprise', newLabel: 'Nouvelle entreprise' },
}
