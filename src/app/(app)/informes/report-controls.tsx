'use client'

import { Download, Printer } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Field } from '@/components/action-form'
import { MOVEMENT_LABELS, type Establishment, type LotteryNumber } from '@/lib/database.types'

export function ReportFilters({
  establishments,
  numbers,
  params,
}: {
  establishments: Establishment[]
  numbers: LotteryNumber[]
  params: Record<string, string | undefined>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`?${next.toString()}`)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Establecimiento">
        <Select
          value={params.establecimiento ?? ''}
          onChange={(event) => update('establecimiento', event.target.value)}
        >
          <option value="">Todos</option>
          {establishments.map((establishment) => (
            <option key={establishment.id} value={establishment.id}>
              {establishment.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Número de lotería">
        <Select value={params.numero ?? ''} onChange={(event) => update('numero', event.target.value)}>
          <option value="">Todos</option>
          {numbers.map((number) => (
            <option key={number.id} value={number.id}>
              {number.number}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tipo de movimiento">
        <Select value={params.tipo ?? ''} onChange={(event) => update('tipo', event.target.value)}>
          <option value="">Todos</option>
          {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Desde">
        <Input
          type="date"
          value={params.desde ?? ''}
          onChange={(event) => update('desde', event.target.value)}
        />
      </Field>
      <Field label="Hasta">
        <Input
          type="date"
          value={params.hasta ?? ''}
          onChange={(event) => update('hasta', event.target.value)}
        />
      </Field>
    </div>
  )
}

const EXPORTS = [
  ['movimientos', 'Movimientos', false],
  ['establecimientos', 'Establecimientos', false],
  ['numeros', 'Números', true],
  ['caja', 'Caja', true],
  ['fondo', 'Fondo Fiesta', true],
] as const

export function ExportButtons({
  params,
  isAdmin,
}: {
  params: Record<string, string | undefined>
  isAdmin: boolean
}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
  )

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Descargar en CSV (para Excel)</p>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.filter(([, , adminOnly]) => isAdmin || !adminOnly).map(([value, label]) => {
          const search = new URLSearchParams(query)
          search.set('informe', value)
          return (
            <Button key={value} asChild variant="outline" size="sm">
              <a href={`/api/informes?${search.toString()}`} download>
                <Download /> {label}
              </a>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> Imprimir o guardar en PDF
    </Button>
  )
}
