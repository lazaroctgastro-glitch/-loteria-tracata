import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { buildInstallSql, OUTPUT } from '../scripts/build-install-sql.mjs'
import { CONNECTION_STRING, postgresAvailable } from './helpers/postgres'

const available = await postgresAvailable()

describe('supabase/instalacion-completa.sql', () => {
  it('está al día respecto a las migraciones', () => {
    // Si falla: ejecuta `node scripts/build-install-sql.mjs`.
    expect(readFileSync(OUTPUT, 'utf8')).toBe(buildInstallSql())
  })

  it.skipIf(!available)(
    'instala la base de datos entera de una sola vez',
    async () => {
      const client = new Client({ connectionString: CONNECTION_STRING })
      await client.connect()
      try {
        await client.query(`
          drop schema if exists public cascade;
          drop schema if exists auth cascade;
          create schema public;
        `)
        await client.query(readFileSync('tests/helpers/auth-bootstrap.sql', 'utf8'))

        // Un único bloque, tal cual lo pegará el usuario en Supabase.
        await client.query(readFileSync(OUTPUT, 'utf8'))

        // Y se puede volver a ejecutar sin romper nada.
        await client.query(readFileSync(OUTPUT, 'utf8'))

        const tables = await client.query(
          `select table_name from information_schema.tables
           where table_schema = 'public' order by table_name`,
        )
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          'campaigns',
          'count_lines',
          'establishments',
          'lottery_numbers',
          'movements',
          'profiles',
          'user_establishments',
          'v_campaign_summary',
          'v_establishment_dashboard',
          'v_establishment_summary',
          'v_fund_by_establishment',
          'v_integrity_check',
          'v_movements_detailed',
          'v_number_summary',
          'v_sales_since_last_withdrawal',
          'v_stock_central',
          'v_stock_establishment',
        ])

        // La seguridad queda activada en todas las tablas.
        const unprotected = await client.query(
          `select relname from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
        )
        expect(unprotected.rows).toEqual([])
      } finally {
        await client.end()
      }
    },
    180_000,
  )
})
