import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ID, createTestDb, expectError, one, scalar, type Db } from './helpers/db'

/**
 * Escenario base: campaña con precios 20 € / 23 €, un establecimiento y
 * un número de lotería con 100 décimos comprados.
 */
async function setupScenario(db: Db) {
  await db.exec(`select set_config('app.acting_user', '${ADMIN_ID}', false);`)
  const campaign = await one<{ id: string }>(
    db,
    `insert into campaigns (name, year, purchase_price_cents, sale_price_cents, is_default)
     values ('Lotería de Navidad 2026', 2026, 2000, 2300, true) returning id`,
  )
  const est = await one<{ id: string }>(
    db,
    `insert into establishments (name) values ('La Huerta') returning id`,
  )
  await db.query(
    `select api_create_purchase($1, '[{"number":"69588","quantity":100}]'::jsonb, current_date, 'Administración nº 4', null)`,
    [campaign.id],
  )
  const number = await one<{ id: string }>(
    db,
    `select id from lottery_numbers where number = '69588'`,
  )
  return { campaignId: campaign.id, establishmentId: est.id, numberId: number.id }
}

describe('Libro mayor de lotería', () => {
  let db: Db
  let ctx: Awaited<ReturnType<typeof setupScenario>>

  beforeAll(async () => {
    db = await createTestDb()
    ctx = await setupScenario(db)
  })
  afterAll(async () => db?.close())

  // ------------------------------------------------------------------ stock
  it('no permite entregar más décimos de los que hay en el almacén central', async () => {
    const message = await expectError(() =>
      db.query(`select api_deliver($1, $2, 101, current_date, null)`, [
        ctx.establishmentId,
        ctx.numberId,
      ]),
    )
    expect(message).toContain('No hay décimos suficientes')
    expect(await scalar(db, `select qty from v_stock_central where number = '69588'`)).toBe(100)
  })

  it('entrega décimos moviéndolos del almacén central al establecimiento', async () => {
    await db.query(`select api_deliver($1, $2, 20, current_date, null)`, [
      ctx.establishmentId,
      ctx.numberId,
    ])
    expect(await scalar(db, `select qty from v_stock_central where number = '69588'`)).toBe(80)
    expect(
      await scalar(db, `select qty from v_stock_establishment where number = '69588'`),
    ).toBe(20)
  })

  it('no permite vender más décimos de los que tiene el establecimiento', async () => {
    const message = await expectError(() =>
      db.query(`select api_sale($1, $2, 21, current_date, null)`, [
        ctx.establishmentId,
        ctx.numberId,
      ]),
    )
    expect(message).toContain('Solo quedan 20 décimos')
    expect(await scalar(db, `select sold_qty from v_campaign_summary`)).toBe(0)
  })

  // ----------------------------------------------------------------- dinero
  it('una venta de 10 décimos genera 230 € de facturación, 200 € de capital y 30 € de comisión', async () => {
    await db.query(`select api_sale($1, $2, 10, current_date, null)`, [
      ctx.establishmentId,
      ctx.numberId,
    ])
    const summary = await one<Record<string, string>>(
      db,
      `select revenue_cents, capital_cents, commission_cents, sold_qty, stock_qty
       from v_establishment_summary`,
    )
    expect(Number(summary.revenue_cents)).toBe(23000)
    expect(Number(summary.capital_cents)).toBe(20000)
    expect(Number(summary.commission_cents)).toBe(3000)
    expect(Number(summary.sold_qty)).toBe(10)
    expect(Number(summary.stock_qty)).toBe(10)
  })

  it('deja 230 € pendientes de recoger en el establecimiento', async () => {
    expect(await scalar(db, `select pending_cents from v_establishment_summary`)).toBe(23000)
  })

  it('al retirar los 230 € la caja pendiente vuelve a 0 pero la comisión sigue siendo 30 €', async () => {
    await db.query(`select api_withdraw($1, $2, 23000, current_date, 'Liquidación')`, [
      ctx.establishmentId,
      ctx.campaignId,
    ])
    const summary = await one<Record<string, string>>(
      db,
      `select pending_cents, commission_cents, sold_qty, withdrawn_cents from v_establishment_summary`,
    )
    expect(Number(summary.pending_cents)).toBe(0)
    expect(Number(summary.commission_cents)).toBe(3000)
    expect(Number(summary.sold_qty)).toBe(10)
    expect(Number(summary.withdrawn_cents)).toBe(23000)
  })

  it('una retirada parcial mantiene viva la diferencia pendiente', async () => {
    await db.query(`select api_sale($1, $2, 5, current_date, null)`, [
      ctx.establishmentId,
      ctx.numberId,
    ]) // 5 x 23 € = 115 €
    await db.query(`select api_withdraw($1, $2, 11000, current_date, 'Faltaban 10 €')`, [
      ctx.establishmentId,
      ctx.campaignId,
    ])
    // Esperado 115 €, retirado 110 € -> 5 € siguen pendientes.
    expect(await scalar(db, `select pending_cents from v_establishment_summary`)).toBe(500)
  })

  it('el dinero retirado entra en la caja central', async () => {
    const row = await one<Record<string, string>>(
      db,
      `select central_cash_cents, withdrawn_cents, purchases_cost_cents from v_campaign_summary`,
    )
    // 0 aportado - 2.000 € de compra + 340 € retirados
    expect(Number(row.purchases_cost_cents)).toBe(200000)
    expect(Number(row.withdrawn_cents)).toBe(34000)
    expect(Number(row.central_cash_cents)).toBe(-200000 + 34000)
  })

  // --------------------------------------------------------------- recuento
  it('el recuento propone como ventas los décimos que faltan', async () => {
    // Quedan 5 décimos según la app; físicamente hay 2 -> 3 ventas.
    expect(await scalar(db, `select qty from v_stock_establishment where number = '69588'`)).toBe(5)
    const soldBefore = await scalar(db, `select sold_qty from v_establishment_summary`)

    await db.query(
      `select api_register_count($1, $2, jsonb_build_array(
         jsonb_build_object('lottery_number_id', $3::uuid, 'counted_qty', 2)),
         current_date, 'Arqueo')`,
      [ctx.establishmentId, ctx.campaignId, ctx.numberId],
    )

    expect(await scalar(db, `select sold_qty from v_establishment_summary`)).toBe(soldBefore + 3)
    expect(await scalar(db, `select qty from v_stock_establishment where number = '69588'`)).toBe(2)
    // 3 décimos x 23 € = 69 € añadidos a lo pendiente (5 € que ya había)
    expect(await scalar(db, `select pending_cents from v_establishment_summary`)).toBe(6900 + 500)
  })

  it('el recuento deja constancia auditable de lo esperado y lo contado', async () => {
    const line = await one<Record<string, string>>(
      db,
      `select expected_qty, counted_qty, difference_qty from count_lines`,
    )
    expect(Number(line.expected_qty)).toBe(5)
    expect(Number(line.counted_qty)).toBe(2)
    expect(Number(line.difference_qty)).toBe(-3)
  })

  it('un sobrante en el recuento genera un ajuste explícito, nunca un cambio silencioso', async () => {
    await db.query(
      `select api_register_count($1, $2, jsonb_build_array(
         jsonb_build_object('lottery_number_id', $3::uuid, 'counted_qty', 4)),
         current_date, 'Aparecen 2 décimos')`,
      [ctx.establishmentId, ctx.campaignId, ctx.numberId],
    )
    const adj = await one<Record<string, string>>(
      db,
      `select quantity, concept, d_written_off_qty from movements
       where type = 'adjustment' order by created_at desc limit 1`,
    )
    expect(Number(adj.quantity)).toBe(2)
    expect(adj.concept).toContain('Sobrante')
  })

  // ---------------------------------------------------------------- compras
  it('una nueva compra suma stock sin borrar el histórico de las anteriores', async () => {
    const purchasesBefore = await scalar(db, `select count(*) from movements where type = 'purchase'`)
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":25},{"number":"06004","quantity":50}]'::jsonb,
       current_date, 'Administración nº 4', 'Segunda compra')`,
      [ctx.campaignId],
    )
    expect(await scalar(db, `select count(*) from movements where type = 'purchase'`)).toBe(
      purchasesBefore + 2,
    )
    // La compra inicial de 100 décimos sigue intacta en el histórico
    expect(
      await scalar(db, `select quantity from movements where type='purchase' order by created_at limit 1`),
    ).toBe(100)
    expect(await scalar(db, `select purchased_qty from v_number_summary where number='69588'`)).toBe(125)
    expect(await scalar(db, `select purchased_qty from v_campaign_summary`)).toBe(175)
  })

  it('exige que el número de lotería tenga 5 cifras', async () => {
    const message = await expectError(() =>
      db.query(`select api_create_purchase($1, '[{"number":"695","quantity":5}]'::jsonb)`, [
        ctx.campaignId,
      ]),
    )
    expect(message).toContain('5 cifras')
  })

  // ------------------------------------------------------------- integridad
  it('el inventario cuadra siempre', async () => {
    const check = await one<Record<string, unknown>>(db, `select * from v_integrity_check`)
    expect(check.balanced).toBe(true)
    expect(Number(check.inventory_difference_qty)).toBe(0)
    expect(Number(check.money_difference_cents)).toBe(0)
    expect(Number(check.negative_central_numbers)).toBe(0)
    expect(Number(check.negative_establishment_stocks)).toBe(0)
  })

  it('la facturación siempre es capital recuperado + comisión', async () => {
    const row = await one<Record<string, string>>(
      db,
      `select revenue_cents, capital_recovered_cents, commission_cents from v_campaign_summary`,
    )
    expect(Number(row.revenue_cents)).toBe(
      Number(row.capital_recovered_cents) + Number(row.commission_cents),
    )
  })

  // -------------------------------------------------------------- auditoría
  it('no permite borrar ni modificar un movimiento', async () => {
    const deleteError = await expectError(() => db.query(`delete from movements`))
    expect(deleteError).toContain('no se pueden borrar')
    const updateError = await expectError(() => db.query(`update movements set quantity = 999`))
    expect(updateError).toContain('no se pueden modificar')
  })

  it('anular un movimiento crea el movimiento inverso y conserva el original', async () => {
    const sale = await one<{ id: string }>(
      db,
      `select id from movements where type='sale' and group_id is null
       and reversed_by_movement_id is null order by created_at desc limit 1`,
    )
    const soldBefore = await scalar(db, `select sold_qty from v_campaign_summary`)
    const total = await scalar(db, `select count(*) from movements`)

    await db.query(`select api_void_movement($1, 'Registrado por error')`, [sale.id])

    expect(await scalar(db, `select count(*) from movements`)).toBe(total + 1)
    expect(await scalar(db, `select count(*) from movements where id = '${sale.id}'`)).toBe(1)
    const reversal = await one<Record<string, string>>(
      db,
      `select d_sold_qty, type from movements where reverses_movement_id = '${sale.id}'`,
    )
    expect(reversal.type).toBe('sale')
    expect(Number(reversal.d_sold_qty)).toBeLessThan(0)
    expect(await scalar(db, `select sold_qty from v_campaign_summary`)).toBeLessThan(soldBefore)
    expect((await one<Record<string, unknown>>(db, `select * from v_integrity_check`)).balanced).toBe(true)
  })

  it('anular una operación agrupada la anula entera (un recuento no queda a medias)', async () => {
    const countMovement = await one<{ id: string; group_id: string }>(
      db,
      `select id, group_id from movements
       where type = 'count' and reversed_by_movement_id is null
       order by created_at limit 1`,
    )
    const inGroup = await scalar(
      db,
      `select count(*) from movements where group_id = '${countMovement.group_id}'
       and reverses_movement_id is null`,
    )
    const reversed = await scalar(db, `select api_void_movement('${countMovement.id}')`)
    expect(reversed).toBe(inGroup)
    expect(
      await scalar(
        db,
        `select count(*) from movements where group_id = '${countMovement.group_id}'
         and reverses_movement_id is null and reversed_by_movement_id is null`,
      ),
    ).toBe(0)
    expect((await one<Record<string, unknown>>(db, `select * from v_integrity_check`)).balanced).toBe(true)
  })

  it('no permite anular dos veces el mismo movimiento', async () => {
    const sale = await one<{ id: string }>(
      db,
      `select m.id from movements m where m.reversed_by_movement_id is not null limit 1`,
    )
    const message = await expectError(() => db.query(`select api_void_movement($1)`, [sale.id]))
    expect(message).toContain('ya está anulado')
  })

  it('no permite anular si el inventario quedaría en negativo', async () => {
    const delivery = await one<{ id: string }>(
      db,
      `select id from movements where type='delivery' order by created_at limit 1`,
    )
    // Se han vendido décimos de esa entrega: anularla dejaría el bar en negativo.
    const message = await expectError(() => db.query(`select api_void_movement($1)`, [delivery.id]))
    expect(message).toContain('No se puede anular')
  })

  it('el fondo fiesta descuenta los gastos registrados', async () => {
    const before = await one<Record<string, string>>(
      db,
      `select commission_cents, fund_balance_cents, central_cash_cents from v_campaign_summary`,
    )
    await db.query(`select api_fund_expense($1, 'Fiesta Navidad personal', 5000)`, [ctx.campaignId])
    const after = await one<Record<string, string>>(
      db,
      `select commission_cents, fund_expenses_cents, fund_balance_cents, central_cash_cents
       from v_campaign_summary`,
    )
    expect(Number(after.commission_cents)).toBe(Number(before.commission_cents))
    expect(Number(after.fund_expenses_cents)).toBe(5000)
    expect(Number(after.fund_balance_cents)).toBe(Number(before.fund_balance_cents) - 5000)
    expect(Number(after.central_cash_cents)).toBe(Number(before.central_cash_cents) - 5000)
  })
})
