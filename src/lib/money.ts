/**
 * El dinero SIEMPRE se maneja en céntimos enteros. Nunca se usan decimales en
 * coma flotante para importes: solo se convierten a euros al mostrarlos.
 */

const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const eurCompactFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 23000 -> "230,00 €" */
export function formatMoney(cents: number | string | null | undefined): string {
  return eurFormatter.format(Number(cents ?? 0) / 100)
}

/** 23000 -> "230 €" (sin céntimos cuando son cero) */
export function formatMoneyShort(cents: number | string | null | undefined): string {
  const value = Number(cents ?? 0)
  return value % 100 === 0 ? eurCompactFormatter.format(value / 100) : formatMoney(value)
}

/** "23,50" | "23.50" | "1.234,56" -> 2350 | 123456 */
export function parseMoneyToCents(input: string): number | null {
  const raw = input.trim().replace(/\s|€/g, '')
  if (raw === '') return null

  // Normaliza formatos españoles (1.234,56) e ingleses (1,234.56).
  let normalized = raw
  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  } else if (lastComma > -1) {
    normalized = raw.replace(',', '.')
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  // Se redondea al céntimo trabajando sobre el string para evitar errores de coma flotante.
  const [intPart, decPart = ''] = normalized.split('.')
  const decimals = (decPart + '00').slice(0, 2)
  const sign = intPart.startsWith('-') ? -1 : 1
  const cents = Math.abs(Number(intPart)) * 100 + Number(decimals)
  return sign * cents
}

export function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('es-ES').format(Number(value ?? 0))
}

/** "18 décimos" / "1 décimo" */
export function decimos(quantity: number | string | null | undefined): string {
  const n = Number(quantity ?? 0)
  return `${formatNumber(n)} ${n === 1 ? 'décimo' : 'décimos'}`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}
