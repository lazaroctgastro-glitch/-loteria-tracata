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

/** Base de datos limpia con todas las migraciones aplicadas. */
export async function resetDatabase(): Promise<void> {
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
  await client.query(
    `insert into auth.users (id, email) values ($1, 'admin@tracata.local') on conflict do nothing`,
    [ADMIN_ID],
  )
  await client.query(
    `insert into profiles (id, email, full_name, role)
     values ($1, 'admin@tracata.local', 'Administrador', 'admin') on conflict do nothing`,
    [ADMIN_ID],
  )
  await client.end()
}

export async function connectAsAdmin(): Promise<Client> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  await client.query(`select set_config('app.acting_user', $1, false)`, [ADMIN_ID])
  return client
}
