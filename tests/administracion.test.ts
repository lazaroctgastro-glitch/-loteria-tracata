import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ID, createTestDb, expectError, one, scalar, type Db } from './helpers/db'

const EUR = (cents: number | string) => Number(cents) / 100

/**
 * Los casos de prueba obligatorios del negocio real.
 *
 * Principio: STOCK ≠ VENTAS ≠ DINERO FÍSICO ≠ DEUDA.
 * Vender no llena la caja central; la caja solo crece cuando el dinero se
 * recoge físicamente del bar.
 */
async function setup(db: Db) {
  await db.exec(`select set_config('app.acting_user', '${ADMIN_ID}', false);`)
  const campaign = await one<{ id: string }>(
    db,
    `insert into campaigns (name, year, purchase_price_cents, sale_price_cents, is_default)
     values ('Navidad 2026', 2026, 2000, 2300, true) returning id`,
  )
  const bar = await one<{ id: string }>(
    db,
    `insert into establishments (name) values ('BAR A') returning id`,
  )
  return { campaignId: campaign.id, barId: bar.id }
}

const summary = (db: Db) =>
  one<Record<string, string>>(db, `select * from v_campaign_summary`)

describe('Cuenta con la administración y caja real', () => {
  let db: Db
  let ctx: Awaited<ReturnType<typeof setup>>
  let numberId: string

  beforeAll(async () => {
    db = await createTestDb()
    ctx = await setup(db)
  })
  afterAll(async () => db?.close())

  it('TEST 1 · retirar 15 décimos sin pagar genera 300 € de deuda y no toca la caja', async () => {
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":15}]'::jsonb, current_date, 'Administración nº 4', null, 0)`,
      [ctx.campaignId],
    )
    numberId = (await one<{ id: string }>(db, `select id from lottery_numbers`)).id

    const s = await summary(db)
    expect(Number(s.central_stock_qty)).toBe(15)
    expect(EUR(s.supplier_debt_cents)).toBe(300)
    expect(EUR(s.central_cash_cents)).toBe(0)
    expect(EUR(s.supplier_paid_cents)).toBe(0)
  })

  it('TEST 2 · pagar 300 € y retirar otros 300 € deja la deuda igual', async () => {
    // Partimos de 300 € de deuda; añadimos 100 € para llegar a los 400 € del ejemplo.
    await db.query(`select api_set_opening_balances($1, 10000, 0, '[]'::jsonb)`, [ctx.campaignId])
    expect(EUR((await summary(db)).supplier_debt_cents)).toBe(400)

    // Hace falta dinero en la caja para poder pagar.
    await db.query(`select api_capital_injection($1, 50000, current_date, 'Aportación')`, [
      ctx.campaignId,
    ])

    await db.query(`select api_pay_supplier($1, 30000, current_date, 'Efectivo')`, [ctx.campaignId])
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":15}]'::jsonb)`,
      [ctx.campaignId],
    )

    expect(EUR((await summary(db)).supplier_debt_cents)).toBe(400)
  })

  it('la cuenta corriente muestra cargos, pagos y saldo acumulado', async () => {
    const rows = await db.query<Record<string, string>>(
      `select concept, charge_cents, payment_cents, balance_cents
       from v_supplier_account order by occurred_on, created_at`,
    )
    expect(rows.rows).toHaveLength(4) // retirada, saldo inicial, pago, retirada
    expect(EUR(rows.rows.at(-1)!.balance_cents)).toBe(400)
    // El saldo final de la cuenta coincide siempre con la deuda del resumen.
    expect(EUR(rows.rows.at(-1)!.balance_cents)).toBe(
      EUR((await summary(db)).supplier_debt_cents),
    )
  })

  it('TEST 3 · entregar 10 décimos a un bar mueve stock y no mueve dinero', async () => {
    const before = await summary(db)
    await db.query(`select api_deliver($1, $2, 10)`, [ctx.barId, numberId])
    const after = await summary(db)

    expect(Number(after.central_stock_qty)).toBe(Number(before.central_stock_qty) - 10)
    expect(Number(after.establishment_stock_qty)).toBe(10)
    expect(after.central_cash_cents).toBe(before.central_cash_cents)
    expect(after.supplier_debt_cents).toBe(before.supplier_debt_cents)
  })

  it('TEST 4 · vender 5 décimos: 115 € vendidos, 100 € capital, 15 € comisión, caja igual', async () => {
    const before = await summary(db)
    await db.query(`select api_sale($1, $2, 5)`, [ctx.barId, numberId])
    const after = await summary(db)

    expect(Number(after.sold_qty)).toBe(5)
    expect(Number(after.establishment_stock_qty)).toBe(5)
    expect(EUR(after.revenue_cents)).toBe(115)
    expect(EUR(after.capital_recovered_cents)).toBe(100)
    expect(EUR(after.commission_cents)).toBe(15)
    expect(EUR(after.pending_in_establishments_cents)).toBe(115)
    // Vender NO aumenta la caja central.
    expect(after.central_cash_cents).toBe(before.central_cash_cents)
  })

  it('TEST 5 · retirar 70 € del bar deja 45 € pendientes y sube la caja 70 €', async () => {
    const before = await summary(db)
    await db.query(`select api_withdraw($1, $2, 7000)`, [ctx.barId, ctx.campaignId])
    const after = await summary(db)

    expect(EUR(after.pending_in_establishments_cents)).toBe(45)
    expect(EUR(after.central_cash_cents)).toBe(EUR(before.central_cash_cents) + 70)
  })

  it('TEST 6 · retirar los 45 € restantes deja el bar a 0 y 115 € recogidos', async () => {
    await db.query(`select api_withdraw($1, $2, 4500)`, [ctx.barId, ctx.campaignId])
    const s = await summary(db)
    expect(EUR(s.pending_in_establishments_cents)).toBe(0)
    expect(EUR(s.withdrawn_cents)).toBe(115)
  })

  it('TEST 7 · pagar 100 € baja la caja y la deuda en 100 €', async () => {
    const before = await summary(db)
    await db.query(`select api_pay_supplier($1, 10000)`, [ctx.campaignId])
    const after = await summary(db)

    expect(EUR(after.central_cash_cents)).toBe(EUR(before.central_cash_cents) - 100)
    expect(EUR(after.supplier_debt_cents)).toBe(EUR(before.supplier_debt_cents) - 100)
    expect(EUR(after.supplier_paid_cents)).toBe(EUR(before.supplier_paid_cents) + 100)
  })

  it('no deja recoger de un bar más dinero del que hay pendiente', async () => {
    const message = await expectError(() =>
      db.query(`select api_withdraw($1, $2, 5000)`, [ctx.barId, ctx.campaignId]),
    )
    expect(message).toContain('solo hay')
    expect(message).toContain('Corregir la caja del bar')
  })

  it('permite corregir la caja de un bar dejando constancia del motivo', async () => {
    await db.query(`select api_adjust_establishment_cash($1, $2, 500, 'Sobraban 5 € en la caja')`, [
      ctx.barId,
      ctx.campaignId,
    ])
    expect(EUR((await summary(db)).pending_in_establishments_cents)).toBe(5)
    const adj = await one<Record<string, string>>(
      db,
      `select concept, amount_cents from movements where type::text = 'cash_adjustment'`,
    )
    expect(adj.concept).toBe('Sobraban 5 € en la caja')
  })

  it('devolver décimos a la administración baja stock y deuda', async () => {
    const before = await summary(db)
    await db.query(`select api_return_to_supplier($1, 5)`, [numberId])
    const after = await summary(db)

    expect(Number(after.central_stock_qty)).toBe(Number(before.central_stock_qty) - 5)
    expect(EUR(after.supplier_debt_cents)).toBe(EUR(before.supplier_debt_cents) - 100)
    expect(after.central_cash_cents).toBe(before.central_cash_cents)
  })

  it('no deja devolver más décimos de los que hay en el almacén', async () => {
    const message = await expectError(() => db.query(`select api_return_to_supplier($1, 9999)`, [numberId]))
    expect(message).toContain('solo quedan')
  })

  it('el inventario y el dinero siguen cuadrando', async () => {
    const check = await one<Record<string, unknown>>(db, `select * from v_integrity_check`)
    expect(check.balanced).toBe(true)
  })
})

/**
 * El escenario completo del negocio, de principio a fin.
 * Si cualquiera de estos valores no coincide, la lógica está mal.
 */
describe('Escenario completo', () => {
  let db: Db
  let campaignId: string
  let barId: string
  let numberId: string

  beforeAll(async () => {
    db = await createTestDb()
    const ctx = await setup(db)
    campaignId = ctx.campaignId
    barId = ctx.barId
  })
  afterAll(async () => db?.close())

  it('produce exactamente las cifras esperadas', async () => {
    // 1. Retiro 100 décimos de la administración sin pagar nada.
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":100}]'::jsonb)`,
      [campaignId],
    )
    numberId = (await one<{ id: string }>(db, `select id from lottery_numbers`)).id

    let s = await summary(db)
    expect(EUR(s.supplier_debt_cents)).toBe(2000)
    expect(Number(s.central_stock_qty)).toBe(100)
    expect(EUR(s.central_cash_cents)).toBe(0)

    // 2. Entrego 50 al bar.
    await db.query(`select api_deliver($1, $2, 50)`, [barId, numberId])
    s = await summary(db)
    expect(Number(s.central_stock_qty)).toBe(50)
    expect(Number(s.establishment_stock_qty)).toBe(50)

    // 3. El bar vende 10.
    await db.query(`select api_sale($1, $2, 10)`, [barId, numberId])
    s = await summary(db)
    expect(Number(s.sold_qty)).toBe(10)
    expect(Number(s.establishment_stock_qty)).toBe(40)
    expect(EUR(s.revenue_cents)).toBe(230)
    expect(EUR(s.capital_recovered_cents)).toBe(200)
    expect(EUR(s.commission_cents)).toBe(30)
    expect(EUR(s.pending_in_establishments_cents)).toBe(230)
    expect(EUR(s.central_cash_cents)).toBe(0)

    // 4. Voy al bar y recojo 150 €.
    await db.query(`select api_withdraw($1, $2, 15000)`, [barId, campaignId])
    s = await summary(db)
    expect(EUR(s.pending_in_establishments_cents)).toBe(80)
    expect(EUR(s.central_cash_cents)).toBe(150)

    // 5. Pago 100 € a la administración.
    await db.query(`select api_pay_supplier($1, 10000)`, [campaignId])

    // ---------------------- RESULTADO FINAL OBLIGATORIO ----------------------
    s = await summary(db)
    expect(EUR(s.supplier_debt_cents)).toBe(1900)
    expect(EUR(s.central_cash_cents)).toBe(50)
    expect(EUR(s.pending_in_establishments_cents)).toBe(80)
    expect(Number(s.central_stock_qty)).toBe(50)
    expect(Number(s.establishment_stock_qty)).toBe(40)
    expect(Number(s.total_stock_qty)).toBe(90)
    expect(Number(s.sold_qty)).toBe(10)
    expect(EUR(s.revenue_cents)).toBe(230)
    expect(EUR(s.capital_recovered_cents)).toBe(200)
    expect(EUR(s.commission_cents)).toBe(30)

    // Indicadores derivados del dashboard
    expect(EUR(s.stock_value_cents)).toBe(1800) // 90 décimos × 20 €
    expect(EUR(s.withdrawn_cents)).toBe(150)
    expect(EUR(s.supplier_paid_cents)).toBe(100)
    expect(EUR(s.purchases_cost_cents)).toBe(2000)
    // Posición: 50 caja + 80 pendiente + 1.800 stock − 1.900 deuda
    expect(EUR(s.position_cents)).toBe(30)

    expect((await one<Record<string, unknown>>(db, `select * from v_integrity_check`)).balanced).toBe(true)
  })

  it('anular la retirada de lotería deshace también la deuda', async () => {
    const purchase = await one<{ id: string }>(
      db,
      `select id from movements where type = 'purchase' limit 1`,
    )
    // No se puede: los décimos ya están repartidos y vendidos.
    const message = await expectError(() => db.query(`select api_void_movement($1)`, [purchase.id]))
    expect(message).toContain('No se puede anular')

    // Pero una retirada nueva sin usar sí se puede anular, y la deuda vuelve atrás.
    const before = EUR((await summary(db)).supplier_debt_cents)
    await db.query(`select api_create_purchase($1, '[{"number":"06004","quantity":10}]'::jsonb)`, [
      campaignId,
    ])
    expect(EUR((await summary(db)).supplier_debt_cents)).toBe(before + 200)

    const fresh = await one<{ id: string }>(
      db,
      `select id from movements where type = 'purchase'
       and reversed_by_movement_id is null order by created_at desc limit 1`,
    )
    await db.query(`select api_void_movement($1, 'Me equivoqué de número')`, [fresh.id])
    expect(EUR((await summary(db)).supplier_debt_cents)).toBe(before)
  })

  it('una retirada pagada en parte deja la deuda correcta y baja la caja', async () => {
    const before = await summary(db)
    // 15 décimos = 300 €, pago 100 € en el momento.
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":15}]'::jsonb,
        current_date, 'Administración nº 4', null, 10000)`,
      [campaignId],
    )
    const after = await summary(db)

    expect(Number(after.central_stock_qty)).toBe(Number(before.central_stock_qty) + 15)
    expect(EUR(after.supplier_debt_cents)).toBe(EUR(before.supplier_debt_cents) + 200)
    expect(EUR(after.central_cash_cents)).toBe(EUR(before.central_cash_cents) - 100)

    // En la cuenta corriente se ve el cargo y el pago por separado.
    const lines = await db.query<Record<string, string>>(
      `select charge_cents, payment_cents from v_supplier_account
       order by created_at desc limit 2`,
    )
    const charges = lines.rows.map((r) => EUR(r.charge_cents)).filter(Boolean)
    const payments = lines.rows.map((r) => EUR(r.payment_cents)).filter(Boolean)
    expect(charges).toEqual([300])
    expect(payments).toEqual([100])
  })

  it('no deja pagar en el momento más de lo que vale la retirada', async () => {
    const message = await expectError(() =>
      db.query(
        `select api_create_purchase($1, '[{"number":"69588","quantity":1}]'::jsonb,
          current_date, null, null, 99999)`,
        [campaignId],
      ),
    )
    expect(message).toContain('No puedes pagar')
  })
})
