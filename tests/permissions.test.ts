import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  MANAGER_ID,
  OTHER_MANAGER_ID,
  createTestDb,
  expectError,
  one,
  queryAs,
  scalar,
  type Db,
} from './helpers/db'

/**
 * Los permisos se comprueban ejecutando con el rol `authenticated` y el JWT del
 * usuario, exactamente igual que lo hace el navegador contra Supabase. Así se
 * verifica la Row Level Security real, no que la interfaz oculte botones.
 */
describe('Permisos y Row Level Security', () => {
  let db: Db
  let huerta: string
  let raspa: string
  let campaign: string
  let numberId: string

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`select set_config('app.acting_user', '${ADMIN_ID}', false);`)
    campaign = (
      await one<{ id: string }>(
        db,
        `insert into campaigns (name, year, is_default) values ('Navidad 2026', 2026, true) returning id`,
      )
    ).id
    huerta = (
      await one<{ id: string }>(db, `insert into establishments (name) values ('La Huerta') returning id`)
    ).id
    raspa = (
      await one<{ id: string }>(db, `insert into establishments (name) values ('Raspa') returning id`)
    ).id
    await db.query(
      `select api_create_purchase($1, '[{"number":"69588","quantity":50}]'::jsonb)`,
      [campaign],
    )
    numberId = (await one<{ id: string }>(db, `select id from lottery_numbers`)).id
    await db.query(`select api_deliver($1, $2, 20, current_date, null)`, [huerta, numberId])
    await db.query(`select api_deliver($1, $2, 20, current_date, null)`, [raspa, numberId])
    // Marta solo es responsable de La Huerta; Jose solo de Raspa.
    await db.query(`insert into user_establishments (user_id, establishment_id) values ($1, $2)`, [
      MANAGER_ID,
      huerta,
    ])
    await db.query(`insert into user_establishments (user_id, establishment_id) values ($1, $2)`, [
      OTHER_MANAGER_ID,
      raspa,
    ])
  })
  afterAll(async () => db?.close())

  it('un responsable solo ve su propio establecimiento', async () => {
    const rows = await queryAs<{ name: string }>(db, MANAGER_ID, `select name from establishments`)
    expect(rows.map((r) => r.name)).toEqual(['La Huerta'])
  })

  it('el administrador ve todos los establecimientos', async () => {
    const rows = await queryAs<{ name: string }>(db, ADMIN_ID, `select name from establishments order by name`)
    expect(rows.map((r) => r.name)).toEqual(['La Huerta', 'Raspa'])
  })

  it('un responsable no ve los movimientos de otros establecimientos', async () => {
    const rows = await queryAs<{ establishment_id: string }>(
      db,
      MANAGER_ID,
      `select distinct establishment_id from movements`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].establishment_id).toBe(huerta)
  })

  it('un responsable no ve las compras ni la caja central', async () => {
    const purchases = await queryAs(db, MANAGER_ID, `select * from movements where type = 'purchase'`)
    expect(purchases).toHaveLength(0)

    const summary = await queryAs<Record<string, string>>(
      db,
      MANAGER_ID,
      `select central_cash_cents, purchased_qty from v_campaign_summary`,
    )
    // La vista respeta la RLS: sin acceso a las compras, no ve la caja central.
    expect(Number(summary[0].central_cash_cents)).toBe(0)
    expect(Number(summary[0].purchased_qty)).toBe(0)
  })

  it('un responsable solo ve las cifras de su establecimiento', async () => {
    const rows = await queryAs<Record<string, string>>(
      db,
      MANAGER_ID,
      `select establishment_name, stock_qty from v_establishment_summary`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].establishment_name).toBe('La Huerta')
  })

  it('las tarjetas del panel de inicio también quedan filtradas por RLS', async () => {
    // v_establishment_dashboard cruza establecimientos con campañas: hay que
    // asegurarse de que el filtrado se mantiene a través de las vistas anidadas.
    const managerCards = await queryAs<Record<string, string>>(
      db,
      MANAGER_ID,
      `select establishment_name, stock_qty from v_establishment_dashboard`,
    )
    expect(managerCards.map((row) => row.establishment_name)).toEqual(['La Huerta'])

    const adminCards = await queryAs<Record<string, string>>(
      db,
      ADMIN_ID,
      `select establishment_name from v_establishment_dashboard order by establishment_name`,
    )
    expect(adminCards.map((row) => row.establishment_name)).toEqual(['La Huerta', 'Raspa'])
  })

  it('un responsable no ve las ventas pendientes de otros bares', async () => {
    const rows = await queryAs<Record<string, string>>(
      db,
      OTHER_MANAGER_ID,
      `select establishment_id from v_sales_since_last_withdrawal`,
    )
    expect(rows.every((row) => row.establishment_id === raspa)).toBe(true)
  })

  it('un responsable SÍ puede registrar ventas en su establecimiento', async () => {
    await queryAs(db, MANAGER_ID, `select api_sale('${huerta}', '${numberId}', 3)`)
    const rows = await queryAs<Record<string, string>>(
      db,
      MANAGER_ID,
      `select sold_qty, pending_cents from v_establishment_summary`,
    )
    expect(Number(rows[0].sold_qty)).toBe(3)
    expect(Number(rows[0].pending_cents)).toBe(6900)
  })

  it('un responsable NO puede registrar ventas en otro establecimiento', async () => {
    const message = await expectError(() =>
      queryAs(db, MANAGER_ID, `select api_sale('${raspa}', '${numberId}', 1)`),
    )
    expect(message).toContain('No tienes permiso')
  })

  it('un responsable SÍ puede hacer recuentos de su establecimiento', async () => {
    await queryAs(
      db,
      MANAGER_ID,
      `select api_register_count('${huerta}', '${campaign}', jsonb_build_array(
         jsonb_build_object('lottery_number_id', '${numberId}', 'counted_qty', 15)))`,
    )
    const rows = await queryAs<Record<string, string>>(
      db,
      MANAGER_ID,
      `select sold_qty from v_establishment_summary`,
    )
    expect(Number(rows[0].sold_qty)).toBe(5) // 3 vendidos + 2 detectados en el recuento
  })

  const forbidden: Array<[string, string]> = [
    ['comprar lotería', `select api_create_purchase('CAMPAIGN', '[{"number":"11111","quantity":1}]'::jsonb)`],
    ['entregar lotería', `select api_deliver('HUERTA', 'NUMBER', 1)`],
    ['devolver lotería', `select api_return('HUERTA', 'NUMBER', 1)`],
    ['retirar dinero', `select api_withdraw('HUERTA', 'CAMPAIGN', 100)`],
    ['registrar gastos del fondo', `select api_fund_expense('CAMPAIGN', 'Fiesta', 100)`],
    ['ajustar inventario', `select api_adjust_stock('NUMBER', null, -1, 'motivo')`],
  ]

  it.each(forbidden)('un responsable NO puede %s', async (_label, sql) => {
    const message = await expectError(() =>
      queryAs(
        db,
        MANAGER_ID,
        sql.replace('CAMPAIGN', campaign).replace(/HUERTA/g, huerta).replace(/NUMBER/g, numberId),
      ),
    )
    expect(message).toContain('Solo un administrador')
  })

  it('un responsable NO puede anular movimientos', async () => {
    const sale = await one<{ id: string }>(
      db,
      `select id from movements where type='sale' and group_id is null limit 1`,
    )
    const message = await expectError(() =>
      queryAs(db, MANAGER_ID, `select api_void_movement('${sale.id}')`),
    )
    expect(message).toContain('Solo un administrador')
  })

  it('nadie puede escribir directamente en el libro mayor saltándose las funciones', async () => {
    const message = await expectError(() =>
      queryAs(
        db,
        MANAGER_ID,
        `insert into movements (campaign_id, type) values ('${campaign}', 'sale')`,
      ),
    )
    expect(message).toMatch(/permission denied|permiso/i)
  })

  it('un responsable no puede darse permisos de administrador', async () => {
    // La RLS no deja que la fila entre en el UPDATE: la sentencia no afecta a
    // ninguna fila y el rol se queda como estaba.
    await queryAs(db, MANAGER_ID, `update profiles set role = 'admin' where id = '${MANAGER_ID}'`)
    const role = await one<{ role: string }>(
      db,
      `select role from profiles where id = '${MANAGER_ID}'`,
    )
    expect(role.role).toBe('manager')
    expect(await scalar(db, `select count(*) from profiles where role = 'admin'`)).toBe(1)
  })

  it('un responsable no puede asignarse otro establecimiento', async () => {
    const message = await expectError(() =>
      queryAs(
        db,
        MANAGER_ID,
        `insert into user_establishments (user_id, establishment_id) values ('${MANAGER_ID}', '${raspa}')`,
      ),
    )
    expect(message).toMatch(/permission denied|row-level security|violates/i)
  })
})
