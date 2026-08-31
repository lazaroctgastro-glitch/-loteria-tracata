import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ID, createTestDb, one, scalar, type Db } from './helpers/db'

const EUR = (cents: number) => cents / 100

/**
 * Comprueba, cifra a cifra, el escenario de demostración completo:
 * compra inicial, entregas, ventas, retirada completa, retirada parcial,
 * devolución, recuento y segunda compra.
 */
describe('Datos de demostración', () => {
  let db: Db

  beforeAll(async () => {
    db = await createTestDb()
    await db.query(`select dev_seed_demo_data($1)`, [ADMIN_ID])
  })
  afterAll(async () => db?.close())

  it('crea la campaña Navidad 2026 con los precios 20 € / 23 €', async () => {
    const c = await one<Record<string, string>>(
      db,
      `select campaign_name, year, purchase_price_cents, sale_price_cents, commission_price_cents
       from v_campaign_summary`,
    )
    expect(c.campaign_name).toBe('Lotería de Navidad 2026')
    expect(Number(c.purchase_price_cents)).toBe(2000)
    expect(Number(c.sale_price_cents)).toBe(2300)
    expect(Number(c.commission_price_cents)).toBe(300)
  })

  it('crea los cinco establecimientos', async () => {
    expect(await scalar(db, `select count(*) from establishments`)).toBe(5)
  })

  it('cuadra los indicadores generales del dashboard', async () => {
    const s = await one<Record<string, string>>(db, `select * from v_campaign_summary`)
    expect(Number(s.purchased_qty)).toBe(150) // 100 + 50
    expect(Number(s.sold_qty)).toBe(38) // 36 ventas + 2 detectadas en el recuento
    expect(Number(s.central_stock_qty)).toBe(34)
    expect(Number(s.establishment_stock_qty)).toBe(78)
    expect(Number(s.total_stock_qty)).toBe(112)
    expect(EUR(Number(s.revenue_cents))).toBe(874) // 38 x 23 €
    expect(EUR(Number(s.capital_recovered_cents))).toBe(760) // 38 x 20 €
    expect(EUR(Number(s.commission_cents))).toBe(114) // 38 x 3 €
    expect(EUR(Number(s.pending_in_establishments_cents))).toBe(378)
    expect(EUR(Number(s.withdrawn_cents))).toBe(496) // 276 € + 220 €
    expect(EUR(Number(s.purchases_cost_cents))).toBe(3000) // 2.000 € + 1.000 €
    expect(EUR(Number(s.central_cash_cents))).toBe(446) // 3000 - 3000 + 496 - 50
    expect(EUR(Number(s.fund_expenses_cents))).toBe(50)
    expect(EUR(Number(s.fund_balance_cents))).toBe(64) // 114 € - 50 €
  })

  it('deja La Huerta liquidada tras la retirada completa', async () => {
    const e = await one<Record<string, string>>(
      db,
      `select * from v_establishment_summary where establishment_name = 'La Huerta'`,
    )
    expect(Number(e.delivered_qty)).toBe(50) // 30 del 69588 + 20 del 06004
    expect(Number(e.sold_qty)).toBe(12)
    expect(Number(e.stock_qty)).toBe(38)
    expect(EUR(Number(e.revenue_cents))).toBe(276)
    expect(EUR(Number(e.commission_cents))).toBe(36)
    expect(EUR(Number(e.pending_cents))).toBe(0)
    expect(EUR(Number(e.withdrawn_cents))).toBe(276)
  })

  it('mantiene viva la diferencia de la retirada parcial en Raspa', async () => {
    const e = await one<Record<string, string>>(
      db,
      `select * from v_establishment_summary where establishment_name = 'Raspa'`,
    )
    expect(Number(e.sold_qty)).toBe(10)
    expect(EUR(Number(e.revenue_cents))).toBe(230)
    expect(EUR(Number(e.withdrawn_cents))).toBe(220)
    expect(EUR(Number(e.pending_cents))).toBe(10) // la diferencia NO se borra
  })

  it('registra en El Rincón las ventas detectadas en el recuento', async () => {
    const e = await one<Record<string, string>>(
      db,
      `select * from v_establishment_summary where establishment_name = 'El Rincón'`,
    )
    expect(Number(e.delivered_qty)).toBe(20)
    expect(Number(e.sold_qty)).toBe(9) // 7 registradas + 2 del recuento
    expect(Number(e.stock_qty)).toBe(11)
    expect(EUR(Number(e.pending_cents))).toBe(207)
  })

  it('devuelve al almacén central los décimos de la Marisquería', async () => {
    const e = await one<Record<string, string>>(
      db,
      `select * from v_establishment_summary where establishment_name = 'Marisquería Tracatá'`,
    )
    expect(Number(e.delivered_qty)).toBe(10)
    expect(Number(e.returned_qty)).toBe(4)
    expect(Number(e.sold_qty)).toBe(3)
    expect(Number(e.stock_qty)).toBe(3)
  })

  it('conserva las dos compras en el histórico', async () => {
    const purchases = await db.query<Record<string, string>>(
      `select number, purchased_qty, central_qty, distributed_qty, sold_qty
       from v_number_summary order by number`,
    )
    expect(purchases.rows).toHaveLength(2)
    expect(purchases.rows[0].number).toBe('06004')
    expect(Number(purchases.rows[0].purchased_qty)).toBe(50)
    expect(Number(purchases.rows[0].central_qty)).toBe(30)
    expect(Number(purchases.rows[1].number)).toBe(69588)
    expect(Number(purchases.rows[1].purchased_qty)).toBe(100)
    expect(Number(purchases.rows[1].sold_qty)).toBe(38)
  })

  it('reparte el fondo fiesta por establecimiento', async () => {
    const rows = await db.query<Record<string, string>>(
      `select establishment_name, sold_qty, commission_cents
       from v_fund_by_establishment order by commission_cents desc`,
    )
    const total = rows.rows.reduce((acc, r) => acc + Number(r.commission_cents), 0)
    expect(EUR(total)).toBe(114)
    expect(rows.rows[0].establishment_name).toBe('La Huerta')
    expect(EUR(Number(rows.rows[0].commission_cents))).toBe(36)
  })

  it('no presenta ningún descuadre', async () => {
    const check = await one<Record<string, unknown>>(db, `select * from v_integrity_check`)
    expect(check.balanced).toBe(true)
  })
})
