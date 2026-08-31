'use client'

import * as React from 'react'
import { Receipt } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { saleAction } from '@/lib/actions'
import type { Establishment, StockEstablishmentRow } from '@/lib/database.types'
import { decimos, formatMoney, todayISO } from '@/lib/money'

export function SaleForm({
  establishments,
  stock,
  salePriceCents,
  purchasePriceCents,
  defaultEstablishmentId,
}: {
  establishments: Establishment[]
  stock: StockEstablishmentRow[]
  salePriceCents: number
  purchasePriceCents: number
  defaultEstablishmentId?: string
}) {
  const [establishmentId, setEstablishmentId] = React.useState(
    defaultEstablishmentId ?? establishments[0]?.id ?? '',
  )
  const [numberId, setNumberId] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')

  const available = React.useMemo(
    () => stock.filter((row) => row.establishment_id === establishmentId && row.qty > 0),
    [stock, establishmentId],
  )

  React.useEffect(() => {
    setNumberId((current) =>
      available.some((row) => row.lottery_number_id === current)
        ? current
        : (available[0]?.lottery_number_id ?? ''),
    )
  }, [available])

  const selected = available.find((row) => row.lottery_number_id === numberId)
  const qty = Number(quantity)
  const validQty = Number.isInteger(qty) && qty > 0
  const tooMany = Boolean(selected) && validQty && qty > selected!.qty

  return (
    <ActionForm action={saleAction} resetOnSuccess={false}>
      {(state) => (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <Field label="Establecimiento" htmlFor="establishment_id" error={state.fieldErrors?.establishment_id}>
              <Select
                id="establishment_id"
                name="establishment_id"
                value={establishmentId}
                onChange={(event) => setEstablishmentId(event.target.value)}
                required
              >
                <option value="">Elige un establecimiento</option>
                {establishments.map((establishment) => (
                  <option key={establishment.id} value={establishment.id}>
                    {establishment.name}
                  </option>
                ))}
              </Select>
            </Field>

            {available.length === 0 ? (
              <p className="rounded-lg bg-warning/10 p-3 text-sm font-medium text-warning">
                Este establecimiento no tiene décimos disponibles ahora mismo.
              </p>
            ) : (
              <Field
                label="Número de lotería"
                htmlFor="lottery_number_id"
                error={state.fieldErrors?.lottery_number_id}
              >
                <Select
                  id="lottery_number_id"
                  name="lottery_number_id"
                  value={numberId}
                  onChange={(event) => setNumberId(event.target.value)}
                  required
                >
                  {available.map((row) => (
                    <option key={row.lottery_number_id} value={row.lottery_number_id}>
                      {row.number} — quedan {row.qty}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label="¿Cuántos décimos se han vendido?"
              htmlFor="quantity"
              error={state.fieldErrors?.quantity ?? (tooMany ? `Solo quedan ${selected?.qty}` : undefined)}
            >
              <Input
                id="quantity"
                name="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                max={selected?.qty}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                className="h-14 text-center text-2xl font-semibold"
              />
            </Field>

            {selected && validQty && !tooMany ? (
              <div className="space-y-1 rounded-xl bg-secondary/70 p-4">
                <p className="text-center text-2xl font-bold tabular">
                  {formatMoney(qty * salePriceCents)}
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Se sumarán a la caja de lotería del establecimiento
                </p>
                <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coste de esos décimos</span>
                    <span className="tabular font-medium">{formatMoney(qty * purchasePriceCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Para el Fondo Fiesta</span>
                    <span className="tabular font-medium text-success">
                      {formatMoney(qty * (salePriceCents - purchasePriceCents))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quedarán</span>
                    <span className="tabular font-medium">{decimos(selected.qty - qty)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha" htmlFor="occurred_on" error={state.fieldErrors?.occurred_on}>
                <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
              </Field>
              <Field label="Observaciones" htmlFor="notes">
                <Input id="notes" name="notes" placeholder="Opcional" />
              </Field>
            </div>

            <SubmitButton size="lg" className="w-full" disabled={!selected || tooMany || !validQty}>
              <Receipt /> Registrar venta
            </SubmitButton>
          </CardContent>
        </Card>
      )}
    </ActionForm>
  )
}
