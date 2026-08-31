import { describe, expect, it } from 'vitest'
import { createTestDb, scalar } from './helpers/db'

describe('migraciones', () => {
  it('se aplican correctamente sobre Postgres', async () => {
    const db = await createTestDb()
    expect(await scalar(db, 'select count(*) from profiles')).toBe(3)
    await db.close()
  })
})
