import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  ADMIN_ID,
  connectAsAdmin,
  connectAsApiClient,
  postgresAvailable,
  resetDatabase,
} from './helpers/postgres'

/**
 * Comprobaciones de seguridad con el mismo rol de base de datos que usa la
 * aplicación en producción (`authenticator` → `authenticated`), no con el
 * propietario de la base de datos.
 */
const available = await postgresAvailable()

describe.skipIf(!available)('Seguridad desde el rol de la aplicación', () => {
  let admin: Client
  let campaign: string
  let establishment: string
  let numberId: string
  const clients: Client[] = []

  beforeAll(async () => {
    await resetDatabase()
    admin = await connectAsAdmin()
    clients.push(admin)
    campaign = (
      await admin.query(
        `insert into campaigns (name, year, is_default) values ('Navidad 2026', 2026, true) returning id`,
      )
    ).rows[0].id
    establishment = (
      await admin.query(`insert into establishments (name) values ('La Huerta') returning id`)
    ).rows[0].id
    await admin.query(`select api_create_purchase($1, '[{"number":"69588","quantity":10}]'::jsonb)`, [
      campaign,
    ])
    numberId = (await admin.query(`select id from lottery_numbers`)).rows[0].id
  }, 180_000)

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)))
  })

  it('sin sesión no se ve ningún movimiento', async () => {
    const client = await connectAsApiClient()
    clients.push(client)
    const movements = await client.query(`select * from movements`)
    expect(movements.rows).toHaveLength(0)
  })

  it('no se puede suplantar a un administrador definiendo app.acting_user', async () => {
    const client = await connectAsApiClient()
    clients.push(client)
    // Un atacante que consiguiese fijar esta variable seguiría sin ser admin,
    // porque la vía de suplantación solo existe para migraciones y seed.
    await client.query(`select set_config('app.acting_user', $1, false)`, [ADMIN_ID])

    const isAdmin = await client.query(`select app_is_admin() as ok`)
    expect(isAdmin.rows[0].ok).toBe(false)

    await expect(
      client.query(`select api_deliver($1, $2, 1)`, [establishment, numberId]),
    ).rejects.toThrow(/Solo un administrador/)

    const movements = await client.query(`select count(*)::int as total from movements`)
    expect(movements.rows[0].total).toBe(0)
  })

  it('el rol de la aplicación no puede escribir en el libro mayor', async () => {
    const client = await connectAsApiClient(ADMIN_ID)
    clients.push(client)
    await expect(
      client.query(`insert into movements (campaign_id, type) values ($1, 'sale')`, [campaign]),
    ).rejects.toThrow(/permission denied/i)
    await expect(client.query(`delete from movements`)).rejects.toThrow(/permission denied/i)
  })

  it('un administrador con su sesión real sí puede operar', async () => {
    const client = await connectAsApiClient(ADMIN_ID)
    clients.push(client)
    await client.query(`select api_deliver($1, $2, 4)`, [establishment, numberId])
    const stock = await client.query(`select qty from v_stock_central`)
    expect(stock.rows[0].qty).toBe(6)
  })
})
