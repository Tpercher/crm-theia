// Contrat commun des fournisseurs d'enrichissement (FullEnrich, Pipecorn,
// scraper Google / Google Maps maison). Aucun fournisseur n'est encore
// branché : les adaptateurs seront écrits à partir de leur documentation
// d'API, côté serveur uniquement, avec des clés chiffrées par organisation.

export type EnrichmentInput = {
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  domain?: string | null
  linkedinUrl?: string | null
}

// Une valeur trouvée garde sa provenance, pour l'historique et l'arbitrage
// entre fournisseurs. Elle n'écrase jamais une valeur existante sans règle
// explicite.
export type EnrichedValue = {
  field: string
  value: string
  provider: string
  confidence?: number
  fetchedAt: string
}

export type EnrichmentResult =
  | { status: 'found'; values: EnrichedValue[]; creditsUsed?: number }
  | { status: 'not_found'; creditsUsed?: number }
  | { status: 'error'; retryable: boolean; message: string }

export interface EnrichmentProvider {
  key: string
  label: string
  // Champs que le fournisseur sait renvoyer (ex. email, phone).
  fields: string[]
  // Traitement asynchrone (webhook ou polling) ou réponse immédiate.
  mode: 'sync' | 'async'
  enrich(input: EnrichmentInput, apiKey: string): Promise<EnrichmentResult>
}

export const PLANNED_PROVIDERS = [
  { key: 'fullenrich', label: 'FullEnrich', status: 'not_connected' },
  { key: 'pipecorn', label: 'Pipecorn', status: 'not_connected' },
  { key: 'google_scraper', label: 'Scraper Google / Google Maps (interne)', status: 'not_connected' },
] as const
