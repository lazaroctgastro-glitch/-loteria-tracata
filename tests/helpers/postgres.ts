import { Client } from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

export const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:55432/postgres'

export const ADMIN_ID = '11111111-1111-4111-8111-111111111111'

/** ¿Hay un Postgres real disponible para las pruebas de concurrencia? */
export async function postgresAvailable(): Promise<boolean> {
  const client = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}

/** Ejecuta el seed real del proyecto (`supabase/seed.sql`). */
export async function runProjectSeed(): Promise<void> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  try {
    await client.query(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'))
  } finally {
    await client.end()
  }
}

/** Base de datos limpia con todas las migraciones aplicadas. */
export async function resetDatabase(options: { withUsers?: boolean } = {}): Promise<void> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
  `)
  await client.query(readFileSync(join(ROOT, 'tests/helpers/auth-bootstrap.sql'), 'utf8'))
  for (const file of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
    if (!file.endsWith('.sql')) continue
    await client.query(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8'))
  }
  if (options.withUsers !== false) {
    await client.query(
      `insert into auth.users (id, email) values ($1, 'admin@tracata.local') on conflict do nothing`,
      [ADMIN_ID],
    )
    await client.query(
      `insert into profiles (id, email, full_name, role)
       values ($1, 'admin@tracata.local', 'Administrador', 'admin') on conflict do nothing`,
      [ADMIN_ID],
    )
  }
  await client.end()
}

/**
 * Conecta con el rol `authenticator`, igual que hace PostgREST: `session_user`
 * deja de ser el propietario de la base de datos, que es la situación real de
 * cualquier petición hecha desde la aplicación.
 */
export async function connectAsApiClient(jwtUserId?: string): Promise<Client> {
  const url = new URL(CONNECTION_STRING)
  url.username = 'authenticator'
  url.password = ''
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  await client.query(`set role authenticated`)
  if (jwtUserId) {
    await client.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: jwtUserId }),
    ])
  }
  return client
}

export async function connectAsAdmin(): Promise<Client> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  await client.query(`select set_config('app.acting_user', $1, false)`, [ADMIN_ID])
  return client
}
