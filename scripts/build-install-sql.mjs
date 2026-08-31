/**
 * Genera `supabase/instalacion-completa.sql`: todas las migraciones en un único
 * archivo, para poder instalar la base de datos con un solo copiar y pegar en
 * el editor SQL de Supabase, sin instalar nada en el ordenador.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
export const OUTPUT = join(ROOT, 'supabase', 'instalacion-completa.sql')

export function buildInstallSql() {
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort()

  const header = `-- =============================================================================
-- LOTERÍA TRACATÁ · Instalación completa de la base de datos
--
-- Archivo generado automáticamente: NO lo edites a mano.
-- Se crea a partir de supabase/migrations/ con:  node scripts/build-install-sql.mjs
--
-- CÓMO USARLO
--   1. Entra en tu proyecto de Supabase.
--   2. Menú lateral -> SQL Editor -> New query.
--   3. Copia TODO este archivo, pégalo y pulsa "Run".
--
-- Se puede ejecutar más de una vez sin estropear nada.
-- =============================================================================

`

  const body = files
    .map((file) => `-- ${'='.repeat(75)}\n-- Bloque: ${file}\n-- ${'='.repeat(75)}\n\n${readFileSync(join(MIGRATIONS, file), 'utf8').trim()}\n`)
    .join('\n')

  // Supabase (PostgREST) guarda en memoria las funciones disponibles. Este
  // aviso le hace releerlas al instante, para que las funciones nuevas se
  // puedan usar sin esperar ni reiniciar el proyecto.
  const footer = `
-- ${'='.repeat(75)}
-- Avisar a Supabase de que hay funciones nuevas disponibles.
-- ${'='.repeat(75)}
notify pgrst, 'reload schema';
`

  return `${header}${body}${footer}`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, buildInstallSql())
  console.log(`Generado ${OUTPUT}`)
}
