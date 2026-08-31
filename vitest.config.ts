import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: 'forks',
    // Las pruebas de concurrencia y del seed comparten la misma base de datos
    // PostgreSQL, así que los archivos se ejecutan uno detrás de otro.
    fileParallelism: false,
  },
})
