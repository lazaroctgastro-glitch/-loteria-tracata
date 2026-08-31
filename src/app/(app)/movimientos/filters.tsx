'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Field } from '@/components/action-form'
import { MOVEMENT_LABELS, type Establishment, type LotteryNumber } from '@/lib/database.types'

export function MovementFiltersForm({
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

  const hasFilters = ['establecimiento', 'numero', 'tipo', 'desde', 'hasta'].some((key) =>
    Boolean(params[key]),
  )

  return (
    <div className="space-y-4">
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

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.replace('?')}>
          Quitar filtros
        </Button>
      ) : null}
    </div>
  )
}
