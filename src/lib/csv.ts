/** Genera un CSV compatible con Excel en español (separador ; y BOM UTF-8). */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escape = (value: string | number | null) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))]
  return `﻿${lines.join('\r\n')}`
}

/** Los importes se exportan en euros con coma decimal, listos para Excel. */
export function centsToCsv(cents: number | string | null | undefined): string {
  return (Number(cents ?? 0) / 100).toFixed(2).replace('.', ',')
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
