'use client'

import * as React from 'react'
import { Truck, Undo2 } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { deliverAction, returnAction } from '@/lib/actions'
import type { Establishment, StockCentralRow, StockEstablishmentRow } from '@/lib/database.types'
import { decimos, todayISO } from '@/lib/money'
import { cn } from '@/lib/utils'

type Mode = 'deliver' | 'return'

export function DeliveryForm({
  establishments,
  centralStock,
  establishmentStock,
  defaultEstablishmentId,
  defaultMode = 'deliver',
}: {
  establishments: Establishment[]
  centralStock: StockCentralRow[]
  establishmentStock: StockEstablishmentRow[]
  defaultEstablishmentId?: string
  defaultMode?: Mode
}) {
  const [mode, setMode] = React.useState<Mode>(defaultMode)
  const [establishmentId, setEstablishmentId] = React.useState(
    defaultEstablishmentId ?? establishments[0]?.id ?? '',
  )
  const [numberId, setNumberId] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')

  const options = React.useMemo(() => {
    if (mode === 'deliver') {
      return centralStock
        .filter((row) => row.qty > 0)
        .map((row) => ({ id: row.lottery_number_id, number: row.number, qty: row.qty }))
    }
    return establishmentStock
      .filter((row) => row.establishment_id === establishmentId && row.qty > 0)
      .map((row) => ({ id: row.lottery_number_id, number: row.number, qty: row.qty }))
  }, [mode, centralStock, establishmentStock, establishmentId])

  React.useEffect(() => {
    setNumberId((current) =>
      options.some((option) => option.id === current) ? current : (options[0]?.id ?? ''),
    )
  }, [options])

  const selected = options.find((option) => option.id === numberId)
  const qty = Number(quantity)
  const validQty = Number.isInteger(qty) && qty > 0
  const tooMany = Boolean(selected) && validQty && qty > selected!.qty

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1">
        <ModeButton active={mode === 'deliver'} onClick={() => setMode('deliver')}>
          <Truck className="size-4" /> Entregar
        </ModeButton>
        <ModeButton active={mode === 'return'} onClick={() => setMode('return')}>
          <Undo2 className="size-4" /> Devolver
        </ModeButton>
      </div>

      <ActionForm
        key={mode}
        action={mode === 'deliver' ? deliverAction : returnAction}
        resetOnSuccess={false}
      >
        {(state) => (
          <Card>
            <CardContent className="space-y-4 pt-5">
              <p className="rounded-lg bg-secondary/70 p-3 text-sm text-muted-foreground">
                {mode === 'deliver'
                  ? 'Los décimos saldrán del almacén central y pasarán al establecimiento.'
                  : 'Los décimos volverán del establecimiento al almacén central.'}
              </p>

              <Field
                label="Establecimiento"
                htmlFor="establishment_id"
                error={state.fieldErrors?.establishment_id}
              >
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

              {options.length === 0 ? (
                <p className="rounded-lg bg-warning/10 p-3 text-sm font-medium text-warning">
                  {mode === 'deliver'
                    ? 'No queda ningún décimo en el almacén central. Compra lotería antes de repartirla.'
                    : 'Este establecimiento no tiene décimos que devolver.'}
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
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.number} — hay {option.qty}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field
                label="¿Cuántos décimos?"
                htmlFor="quantity"
                error={
                  state.fieldErrors?.quantity ?? (tooMany ? `Solo hay ${selected?.qty}` : undefined)
                }
                hint={selected ? `Después quedarán ${decimos(selected.qty - (validQty ? qty : 0))} en el origen` : undefined}
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

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha" htmlFor="occurred_on" error={state.fieldErrors?.occurred_on}>
                  <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Observaciones" htmlFor="notes">
                  <Input id="notes" name="notes" placeholder="Opcional" />
                </Field>
              </div>

              <SubmitButton size="lg" className="w-full" disabled={!selected || tooMany || !validQty}>
                {mode === 'deliver' ? <Truck /> : <Undo2 />}
                {mode === 'deliver' ? 'Entregar lotería' : 'Devolver al almacén'}
              </SubmitButton>
            </CardContent>
          </Card>
        )}
      </ActionForm>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn('h-10', active && 'bg-card shadow-sm hover:bg-card')}
    >
      {children}
    </Button>
  )
}
