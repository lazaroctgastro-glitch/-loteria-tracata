import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  MANAGER_ID,
  createTestDb,
  expectError,
  one,
  queryAs,
  scalar,
  type Db,
} from './helpers/db'

/**
 * Operaciones de administración que cambian varias cosas a la vez. Se hacen en
 * una sola transacción para que un fallo a mitad no deje el sistema en un
 * estado imposible (sin campaña activa, o un responsable sin establecimientos).
 */
/** Literal de array de PostgreSQL: ['a','b'] -> '{"a","b"}' */
const pgArray = (ids: string[]) => `'{${ids.map((id) => `"${id}"`).join(',')}}'::uuid[]`

describe('Campañas y permisos de usuario', () => {
  let db: Db
  let huerta: string
  let raspa: string

  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`select set_config('app.acting_user', '${ADMIN_ID}', false);`)
    huerta = (
      await one<{ id: string }>(db, `insert into establishments (name) values ('La Huerta') returning id`)
    ).id
    raspa = (
      await one<{ id: string }>(db, `insert into establishments (name) values ('Raspa') returning id`)
    ).id
  })
  afterAll(async () => db?.close())

  // ------------------------------------------------------------- campañas
  it('crea una campaña y la deja en uso', async () => {
    await db.query(`select api_save_campaign(null, 'Navidad 2026', 2026, 2000, 2300, true)`)
    const campaign = await one<Record<string, unknown>>(db, `select * from campaigns`)
    expect(campaign.is_default).toBe(true)
    expect(Number(campaign.purchase_price_cents)).toBe(2000)
  })

  it('al poner otra campaña en uso, deja de estarlo la anterior', async () => {
    await db.query(`select api_save_campaign(null, 'Navidad 2027', 2027, 2100, 2400, true)`)
    const defaults = await db.query<{ name: string }>(
      `select name from campaigns where is_default`,
    )
    expect(defaults.rows.map((row) => row.name)).toEqual(['Navidad 2027'])
    expect(await scalar(db, `select count(*) from campaigns`)).toBe(2)
  })

  it('si al guardar falla algo, NUNCA deja el sistema sin campaña en uso', async () => {
    // Se intenta renombrar una campaña con un nombre que ya existe.
    const id = (await one<{ id: string }>(db, `select id from campaigns where year = 2026`)).id
    const message = await expectError(() =>
      db.query(`select api_save_campaign($1, 'Navidad 2027', 2026, 2000, 2300, true)`, [id]),
    )
    expect(message).toMatch(/campaigns_name_unique|ya existe|duplicate/i)

    // La transacción se deshace entera: sigue habiendo exactamente una en uso.
    const defaults = await db.query<{ name: string }>(`select name from campaigns where is_default`)
    expect(defaults.rows.map((row) => row.name)).toEqual(['Navidad 2027'])
  })

  it('no acepta un precio de venta menor que el de compra', async () => {
    const message = await expectError(() =>
      db.query(`select api_save_campaign(null, 'Mala', 2028, 2300, 2000, true)`),
    )
    expect(message).toContain('no puede ser menor')
  })

  it('un responsable no puede crear ni cambiar campañas', async () => {
    const message = await expectError(() =>
      queryAs(db, MANAGER_ID, `select api_save_campaign(null, 'Suya', 2029, 100, 200, true)`),
    )
    expect(message).toContain('Solo un administrador')
  })

  // ------------------------------------------------------------- usuarios
  it('asigna establecimientos a un responsable', async () => {
    await db.query(
      `select api_set_user_access('${MANAGER_ID}', 'manager', true, ${pgArray([huerta, raspa])})`,
    )
    expect(
      await scalar(db, `select count(*) from user_establishments where user_id = '${MANAGER_ID}'`),
    ).toBe(2)
  })

  it('si la asignación falla, el responsable conserva los establecimientos que tenía', async () => {
    const message = await expectError(() =>
      db.query(
        `select api_set_user_access('${MANAGER_ID}', 'manager', true, ${pgArray([
          huerta,
          '00000000-0000-4000-8000-000000000000', // no existe
        ])})`,
      ),
    )
    expect(message).toMatch(/foreign key|violates/i)
    // No se ha quedado sin acceso a sus bares.
    expect(
      await scalar(db, `select count(*) from user_establishments where user_id = '${MANAGER_ID}'`),
    ).toBe(2)
  })

  it('al ascender a administrador conserva sus asignaciones por si vuelve a ser responsable', async () => {
    await db.query(`select api_set_user_access('${MANAGER_ID}', 'admin', true, '{}'::uuid[])`)
    expect(
      await scalar(db, `select count(*) from user_establishments where user_id = '${MANAGER_ID}'`),
    ).toBe(2)
    await db.query(
      `select api_set_user_access('${MANAGER_ID}', 'manager', true, ${pgArray([huerta])})`,
    )
    expect(
      await scalar(db, `select count(*) from user_establishments where user_id = '${MANAGER_ID}'`),
    ).toBe(1)
  })

  it('un administrador no puede quitarse a sí mismo el acceso', async () => {
    const asManager = await expectError(() =>
      db.query(`select api_set_user_access('${ADMIN_ID}', 'manager', true, '{}'::uuid[])`),
    )
    expect(asManager).toContain('a ti mismo')

    const asInactive = await expectError(() =>
      db.query(`select api_set_user_access('${ADMIN_ID}', 'admin', false, '{}'::uuid[])`),
    )
    expect(asInactive).toContain('a ti mismo')

    expect(await scalar(db, `select count(*) from profiles where role = 'admin' and is_active`)).toBe(1)
  })

  it('un responsable no puede cambiar permisos de nadie', async () => {
    const message = await expectError(() =>
      queryAs(db, MANAGER_ID, `select api_set_user_access('${MANAGER_ID}', 'admin', true, '{}'::uuid[])`),
    )
    expect(message).toContain('Solo un administrador')
  })
})
