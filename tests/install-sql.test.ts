import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { buildInstallSql, OUTPUT } from '../scripts/build-install-sql.mjs'
import { ADMIN_ID, CONNECTION_STRING, postgresAvailable } from './helpers/postgres'

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

  it.skipIf(!available)(
    'se puede volver a ejecutar sobre una base de datos con datos, sin perder nada',
    async () => {
      // Es lo que hace quien instaló una versión anterior y necesita las
      // funciones nuevas: repetir el copiar y pegar no puede costarle sus datos.
      const client = new Client({ connectionString: CONNECTION_STRING })
      await client.connect()
      try {
        await client.query(
          `insert into auth.users (id, email) values ($1, 'admin@tracata.local')
           on conflict do nothing`,
          [ADMIN_ID],
        )
        await client.query(
          `insert into profiles (id, email, full_name, role)
           values ($1, 'admin@tracata.local', 'Administrador', 'admin') on conflict do nothing`,
          [ADMIN_ID],
        )
        await client.query(`select dev_seed_demo_data($1)`, [ADMIN_ID])

        const before = await client.query(`select * from v_campaign_summary`)
        const movements = await client.query(`select count(*)::int as total from movements`)
        expect(movements.rows[0].total).toBeGreaterThan(10)

        // Se vuelve a pegar el instalador entero.
        await client.query(readFileSync(OUTPUT, 'utf8'))

        const after = await client.query(`select * from v_campaign_summary`)
        expect(after.rows).toEqual(before.rows)
        expect((await client.query(`select count(*)::int as total from movements`)).rows[0].total)
          .toBe(movements.rows[0].total)

        // Y ahora sí existen las funciones que la aplicación necesita.
        const functions = await client.query(
          `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and proname like 'api\\_%' order by proname`,
        )
        expect(functions.rows.map((row) => row.proname)).toContain('api_save_campaign')
        expect(functions.rows.map((row) => row.proname)).toContain('api_set_user_access')
      } finally {
        await client.end()
      }
    },
    180_000,
  )
})
