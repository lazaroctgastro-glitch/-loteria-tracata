import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

export const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
export const MANAGER_ID = '22222222-2222-4222-8222-222222222222'
export const OTHER_MANAGER_ID = '33333333-3333-4333-8333-333333333333'

export type Db = PGlite

/**
 * Levanta un Postgres real en memoria, aplica TODAS las migraciones reales del
 * proyecto y crea los usuarios de prueba. Los tests verifican así el SQL que se
 * despliega en producción, no una reimplementación en TypeScript.
 */
export async function createTestDb(): Promise<Db> {
  const db = new PGlite()
  await db.exec(readFileSync(join(__dirname, 'auth-bootstrap.sql'), 'utf8'))

  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith('.sql')) continue
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN_ID}', 'admin@tracata.local'),
      ('${MANAGER_ID}', 'marta@tracata.local'),
      ('${OTHER_MANAGER_ID}', 'jose@tracata.local')
    on conflict do nothing;
    insert into profiles (id, email, full_name, role) values
      ('${ADMIN_ID}', 'admin@tracata.local', 'Administrador', 'admin'),
      ('${MANAGER_ID}', 'marta@tracata.local', 'Marta', 'manager'),
      ('${OTHER_MANAGER_ID}', 'jose@tracata.local', 'Jose', 'manager')
    on conflict (id) do nothing;
  `)

  return db
}

/** Ejecuta como administrador (rol de base de datos propietario). */
export function asAdmin(db: Db) {
  return act(db, ADMIN_ID)
}

/** Ejecuta suplantando a un usuario concreto vía `app.acting_user`. */
export function act(db: Db, userId: string) {
  return db.exec(`select set_config('app.acting_user', '${userId}', false);`)
}

/**
 * Ejecuta una consulta con el rol `authenticated` y el JWT de un usuario, es
 * decir, exactamente igual que lo haría el navegador contra Supabase.
 * Sirve para comprobar que la Row Level Security realmente filtra.
 */
export async function queryAs<T = Record<string, unknown>>(
  db: Db,
  userId: string,
  sql: string,
): Promise<T[]> {
  await db.exec('begin')
  try {
    await db.exec(`
      set local role authenticated;
      set local request.jwt.claims = '{"sub":"${userId}"}';
    `)
    const res = await db.query<T>(sql)
    await db.exec('commit')
    return res.rows
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string): Promise<T> {
  const res = await db.query<T>(sql)
  if (res.rows.length === 0) throw new Error(`Sin resultados: ${sql}`)
  return res.rows[0]
}

export async function scalar(db: Db, sql: string): Promise<number> {
  const row = (await one<Record<string, unknown>>(db, sql)) as Record<string, unknown>
  return Number(Object.values(row)[0])
}

/** Devuelve el mensaje de error de una operación que debe fallar. */
export async function expectError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('Se esperaba un error y la operación tuvo éxito')
}
