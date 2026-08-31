import { describe, expect, it } from 'vitest'
import { decimos, formatMoney, formatMoneyShort, parseMoneyToCents } from '../src/lib/money'

describe('Importes en céntimos enteros', () => {
  it.each([
    ['23', 2300],
    ['23,50', 2350],
    ['23.50', 2350],
    ['0,05', 5],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['276', 27600],
    [' 230 € ', 23000],
    ['0', 0],
  ])('interpreta "%s" como %i céntimos', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '12,3,4', '--5'])('rechaza "%s"', (input) => {
    expect(parseMoneyToCents(input)).toBeNull()
  })

  it('no pierde céntimos por redondeo de coma flotante', () => {
    // 0.1 + 0.2 !== 0.3 en coma flotante: por eso el dinero va en enteros.
    expect(parseMoneyToCents('0,10')! + parseMoneyToCents('0,20')!).toBe(
      parseMoneyToCents('0,30'),
    )
    // 3 € x 383 décimos, sin errores acumulados
    expect(parseMoneyToCents('3,00')! * 383).toBe(114900)
  })

  it('trunca al céntimo y no inventa decimales', () => {
    expect(parseMoneyToCents('23,999')).toBe(2399)
    expect(parseMoneyToCents('23,4')).toBe(2340)
  })

  it('da la vuelta correctamente al formatear', () => {
    for (const cents of [0, 5, 300, 2300, 23000, 114900]) {
      expect(parseMoneyToCents(formatMoney(cents))).toBe(cents)
    }
  })

  it('muestra los importes en formato español', () => {
    expect(formatMoney(23000).replace(/ /g, ' ')).toBe('230,00 €')
    expect(formatMoneyShort(23000).replace(/ /g, ' ')).toBe('230 €')
    expect(formatMoneyShort(23050).replace(/ /g, ' ')).toBe('230,50 €')
  })

  it('escribe los décimos en singular y en plural', () => {
    expect(decimos(1)).toBe('1 décimo')
    expect(decimos(18)).toBe('18 décimos')
    expect(decimos(0)).toBe('0 décimos')
  })
})
