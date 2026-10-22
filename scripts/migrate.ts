// Applique les migrations SQL de db/migrations dans l'ordre, une transaction
// par fichier. Une migration déjà appliquée dont le contenu a changé bloque
// l'exécution : on ne réécrit jamais l'historique d'une base existante.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

export async function migrate(url: string, dir = path.join(process.cwd(), 'db/migrations'), log = console.log) {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`
    const applied = new Map((await sql<{ name: string; checksum: string }[]>`select name, checksum from schema_migrations`).map(r => [r.name, r.checksum]))
    const files = (await readdir(dir)).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort()
    for (const file of files) {
      const body = await readFile(path.join(dir, file), 'utf8')
      const checksum = createHash('sha256').update(body).digest('hex')
      const prev = applied.get(file)
      if (prev === checksum) continue
      if (prev) throw new Error(`La migration ${file} a été modifiée après application. Crée une nouvelle migration au lieu de la changer.`)
      await sql.begin(async tx => {
        await tx.unsafe(body)
        await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`
      })
      log(`appliquée : ${file}`)
    }
  } finally {
    await sql.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.MIGRATION_DATABASE_URL
  if (!url) { console.error('MIGRATION_DATABASE_URL manquant (rôle propriétaire du schéma).'); process.exit(1) }
  migrate(url).catch(e => { console.error(e.message); process.exit(1) })
}
