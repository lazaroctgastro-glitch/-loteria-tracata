import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connectAsAdmin, postgresAvailable, resetDatabase } from './helpers/postgres'

/**
 * Concurrencia real: varias conexiones simultáneas contra un Postgres de
 * verdad. Comprueba que dos personas operando a la vez nunca pueden dejar el
 * stock en negativo (los bloqueos de las funciones las serializan).
 *
 * Requiere un Postgres accesible (TEST_DATABASE_URL). Si no lo hay, se omite.
 */
const available = await postgresAvailable()

describe.skipIf(!available)('Concurrencia (Postgres real)', () => {
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
    await admin.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":10}]'::jsonb)`,
      [campaign],
    )
    numberId = (await admin.query(`select id from lottery_numbers`)).rows[0].id
    await admin.query(`select api_deliver($1, $2, 10)`, [establishment, numberId])
  })

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.end().catch(() => undefined)))
  })

  it('dos ventas simultáneas del mismo número no pueden dejar stock negativo', async () => {
    const a = await connectAsAdmin()
    const b = await connectAsAdmin()
    clients.push(a, b)

    await a.query('begin')
    await b.query('begin')

    // A vende 6 de los 10 disponibles y deja la transacción abierta.
    await a.query(`select api_sale($1, $2, 6)`, [establishment, numberId])

    // B intenta vender otros 6 a la vez: queda bloqueado hasta que A confirme.
    const bSale = b
      .query(`select api_sale($1, $2, 6)`, [establishment, numberId])
      .then(() => 'ok' as const)
      .catch((error: Error) => error.message)

    await a.query('commit')
    const result = await bSale
    await b.query('rollback').catch(() => undefined)

    expect(result).not.toBe('ok')
    expect(result).toContain('Solo quedan 4 décimos')

    const stock = await admin.query(
      `select coalesce(sum(d_establishment_qty),0)::int as qty from movements where establishment_id = $1`,
      [establishment],
    )
    expect(stock.rows[0].qty).toBe(4)
  })

  it('20 entregas simultáneas sobre 10 décimos: solo prosperan 10 y el stock queda en 0', async () => {
    const second = (
      await admin.query(`insert into establishments (name) values ('Raspa') returning id`)
    ).rows[0].id
    await admin.query(
      `select api_create_purchase($1, '[{"number":"06004","quantity":10}]'::jsonb)`,
      [campaign],
    )
    const target = (await admin.query(`select id from lottery_numbers where number = '06004'`))
      .rows[0].id

    const workers = await Promise.all(Array.from({ length: 20 }, () => connectAsAdmin()))
    clients.push(...workers)

    const results = await Promise.all(
      workers.map((client) =>
        client
          .query(`select api_deliver($1, $2, 1)`, [second, target])
          .then(() => 'ok' as const)
          .catch(() => 'error' as const),
      ),
    )

    expect(results.filter((r) => r === 'ok')).toHaveLength(10)
    expect(results.filter((r) => r === 'error')).toHaveLength(10)

    const central = await admin.query(
      `select qty from v_stock_central where lottery_number_id = $1`,
      [target],
    )
    expect(central.rows[0].qty).toBe(0)

    const integrity = await admin.query(`select * from v_integrity_check`)
    expect(integrity.rows[0].balanced).toBe(true)
    expect(integrity.rows[0].negative_central_numbers).toBe('0')
  })

  it('retiradas simultáneas no descuadran la caja pendiente', async () => {
    await admin.query(`select api_sale($1, $2, 4)`, [establishment, numberId]) // 4 x 23 = 92 €
    const a = await connectAsAdmin()
    const b = await connectAsAdmin()
    clients.push(a, b)

    await Promise.all([
      a.query(`select api_withdraw($1, $2, 5000)`, [establishment, campaign]),
      b.query(`select api_withdraw($1, $2, 4200)`, [establishment, campaign]),
    ])

    const pending = await admin.query(
      `select pending_cents from v_establishment_summary where establishment_id = $1`,
      [establishment],
    )
    // 6 + 4 = 10 décimos vendidos = 230 €, retirados 92 € -> 138 € pendientes.
    expect(Number(pending.rows[0].pending_cents)).toBe(23000 - 9200)
  })
})

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[tests] Sin Postgres disponible: se omiten las pruebas de concurrencia.\n' +
      '        Define TEST_DATABASE_URL para ejecutarlas.\n',
  )
}
