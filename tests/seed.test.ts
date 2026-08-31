import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { CONNECTION_STRING, postgresAvailable, resetDatabase, runProjectSeed } from './helpers/postgres'

/**
 * Ejecuta el seed REAL del proyecto (`supabase/seed.sql`), el mismo que corre
 * `supabase db reset`, para garantizar que los datos demo se crean sin errores.
 */
const available = await postgresAvailable()

describe.skipIf(!available)('supabase/seed.sql', () => {
  let db: Client

  beforeAll(async () => {
    await resetDatabase({ withUsers: false })
    await runProjectSeed()
    db = new Client({ connectionString: CONNECTION_STRING })
    await db.connect()
  }, 180_000)

  afterAll(async () => db?.end())

  it('crea los tres usuarios demo con su contraseña', async () => {
    const users = await db.query(
      `select email, encrypted_password is not null as has_password from auth.users order by email`,
    )
    expect(users.rows.map((row) => row.email)).toEqual([
      'admin@tracata.local',
      'jose@tracata.local',
      'marta@tracata.local',
    ])
    expect(users.rows.every((row) => row.has_password)).toBe(true)
  })

  it('deja un administrador y dos responsables con su establecimiento asignado', async () => {
    const roles = await db.query(`select role, count(*)::int from profiles group by role order by role`)
    expect(roles.rows).toEqual([
      { role: 'admin', count: 1 },
      { role: 'manager', count: 2 },
    ])

    const assignments = await db.query(
      `select p.email, e.name from user_establishments ue
       join profiles p on p.id = ue.user_id
       join establishments e on e.id = ue.establishment_id
       order by p.email`,
    )
    expect(assignments.rows).toEqual([
      { email: 'jose@tracata.local', name: 'Raspa' },
      { email: 'marta@tracata.local', name: 'La Huerta' },
    ])
  })

  it('genera el escenario completo con las cifras esperadas', async () => {
    const summary = await db.query(`select * from v_campaign_summary`)
    const row = summary.rows[0]
    expect(row.campaign_name).toBe('Lotería de Navidad 2026')
    expect(row.purchased_qty).toBe(150)
    expect(row.sold_qty).toBe(38)
    expect(row.total_stock_qty).toBe(112)
    expect(Number(row.revenue_cents)).toBe(87400)
    expect(Number(row.commission_cents)).toBe(11400)
    expect(Number(row.pending_in_establishments_cents)).toBe(37800)
    expect(Number(row.central_cash_cents)).toBe(44600)
  })

  it('incluye una retirada completa y otra parcial', async () => {
    const rows = await db.query(
      `select establishment_name, withdrawn_cents, pending_cents
       from v_establishment_summary
       where establishment_name in ('La Huerta', 'Raspa')
       order by establishment_name`,
    )
    expect(Number(rows.rows[0].withdrawn_cents)).toBe(27600)
    expect(Number(rows.rows[0].pending_cents)).toBe(0) // liquidación completa
    expect(Number(rows.rows[1].withdrawn_cents)).toBe(22000)
    expect(Number(rows.rows[1].pending_cents)).toBe(1000) // diferencia que sigue viva
  })

  it('no deja ningún descuadre', async () => {
    const check = await db.query(`select * from v_integrity_check`)
    expect(check.rows[0].balanced).toBe(true)
  })

  it('es idempotente: volver a ejecutarlo no duplica los datos demo', async () => {
    await runProjectSeed()
    const summary = await db.query(`select purchased_qty, sold_qty from v_campaign_summary`)
    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0].purchased_qty).toBe(150)
    expect(summary.rows[0].sold_qty).toBe(38)
  })
})
