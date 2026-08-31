'use client'

import * as React from 'react'
import { ClipboardCheck, TriangleAlert } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { countAction } from '@/lib/actions'
import type { Establishment, StockEstablishmentRow } from '@/lib/database.types'
import { decimos, formatMoney, todayISO } from '@/lib/money'

export function CountForm({
  campaignId,
  establishments,
  stock,
  salePriceCents,
  commissionCents,
  defaultEstablishmentId,
}: {
  campaignId: string
  establishments: Establishment[]
  stock: StockEstablishmentRow[]
  salePriceCents: number
  commissionCents: number
  defaultEstablishmentId?: string
}) {
  const [establishmentId, setEstablishmentId] = React.useState(
    defaultEstablishmentId ?? establishments[0]?.id ?? '',
  )
  const [counted, setCounted] = React.useState<Record<string, string>>({})
  const [confirming, setConfirming] = React.useState(false)

  const rows = React.useMemo(
    () => stock.filter((row) => row.establishment_id === establishmentId),
    [stock, establishmentId],
  )

  // Al cambiar de establecimiento se parte de lo que dice la aplicación.
  React.useEffect(() => {
    setCounted(Object.fromEntries(rows.map((row) => [row.lottery_number_id, String(row.qty)])))
    setConfirming(false)
  }, [rows])

  const lines = rows.map((row) => {
    const raw = counted[row.lottery_number_id] ?? ''
    const value = raw === '' ? null : Number(raw)
    const valid = value !== null && Number.isInteger(value) && value >= 0
    return {
      ...row,
      countedValue: valid ? value : null,
      difference: valid ? value - row.qty : 0,
      valid,
    }
  })

  const anyInvalid = lines.some((line) => !line.valid)
  const soldQty = lines.reduce((acc, line) => acc + Math.max(0, -line.difference), 0)
  const surplusQty = lines.reduce((acc, line) => acc + Math.max(0, line.difference), 0)
  const expectedMoney = soldQty * salePriceCents

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <EstablishmentSelect
            establishments={establishments}
            value={establishmentId}
            onChange={setEstablishmentId}
          />
          <p className="rounded-lg bg-warning/10 p-3 text-sm font-medium text-warning">
            Este establecimiento no tiene décimos que contar.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ActionForm action={countAction} resetOnSuccess={false} onSuccess={() => setConfirming(false)}>
      {(state) => (
        <div className="space-y-4">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <input type="hidden" name="establishment_id" value={establishmentId} />
          <input
            type="hidden"
            name="lines"
            value={JSON.stringify(
              lines
                .filter((line) => line.valid)
                .map((line) => ({
                  lottery_number_id: line.lottery_number_id,
                  counted_qty: line.countedValue,
                })),
            )}
          />

          <Card>
            <CardContent className="space-y-4 pt-5">
              <EstablishmentSelect
                establishments={establishments}
                value={establishmentId}
                onChange={setEstablishmentId}
              />

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Escribe cuántos décimos quedan realmente de cada número.
                </p>
                {lines.map((line) => (
                  <div
                    key={line.lottery_number_id}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-lg font-semibold">{line.number}</p>
                      <p className="text-xs text-muted-foreground">
                        La aplicación dice que quedan {line.qty}
                      </p>
                    </div>
                    <Input
                      aria-label={`Décimos contados del número ${line.number}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      className="h-12 w-24 text-center text-lg font-semibold"
                      value={counted[line.lottery_number_id] ?? ''}
                      onChange={(event) => {
                        setConfirming(false)
                        setCounted((current) => ({
                          ...current,
                          [line.lottery_number_id]: event.target.value,
                        }))
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha" htmlFor="occurred_on" error={state.fieldErrors?.occurred_on}>
                  <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Observaciones" htmlFor="notes">
                  <Input id="notes" name="notes" placeholder="Opcional" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------------- Propuesta antes de confirmar */}
          {!confirming ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={anyInvalid}
              onClick={() => setConfirming(true)}
            >
              <ClipboardCheck /> Calcular el recuento
            </Button>
          ) : (
            <Card className="border-primary/30">
              <CardContent className="space-y-4 pt-5">
                <h2 className="font-semibold">Esto es lo que se va a registrar</h2>

                {soldQty === 0 && surplusQty === 0 ? (
                  <p className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
                    Todo cuadra: no falta ni sobra ningún décimo. Se guardará el recuento como
                    comprobación, sin cambiar nada.
                  </p>
                ) : null}

                {soldQty > 0 ? (
                  <div className="rounded-xl bg-secondary/70 p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Se han vendido {decimos(soldQty)} desde el último recuento
                    </p>
                    <p className="tabular mt-1 text-3xl font-bold">{formatMoney(expectedMoney)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Deberías encontrar ese dinero en su caja de lotería. De ahí,{' '}
                      {formatMoney(soldQty * commissionCents)} van al Fondo Fiesta.
                    </p>
                  </div>
                ) : null}

                {surplusQty > 0 ? (
                  <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm font-medium text-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Hay {decimos(surplusQty)} más de los esperados. Se registrará un ajuste
                      explicando el sobrante para que quede constancia.
                    </span>
                  </div>
                ) : null}

                <ul className="space-y-1 text-sm">
                  {lines
                    .filter((line) => line.difference !== 0)
                    .map((line) => (
                      <li key={line.lottery_number_id} className="flex justify-between">
                        <span className="text-muted-foreground">Número {line.number}</span>
                        <span className="tabular font-medium">
                          {line.qty} → {line.countedValue}{' '}
                          {line.difference < 0
                            ? `(${-line.difference} vendidos)`
                            : `(+${line.difference} de más)`}
                        </span>
                      </li>
                    ))}
                </ul>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    onClick={() => setConfirming(false)}
                  >
                    Volver a contar
                  </Button>
                  <SubmitButton size="lg" className="flex-1">
                    Confirmar recuento
                  </SubmitButton>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </ActionForm>
  )
}

function EstablishmentSelect({
  establishments,
  value,
  onChange,
}: {
  establishments: Establishment[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label="Establecimiento" htmlFor="establishment_select">
      <Select
        id="establishment_select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Elige un establecimiento</option>
        {establishments.map((establishment) => (
          <option key={establishment.id} value={establishment.id}>
            {establishment.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}
