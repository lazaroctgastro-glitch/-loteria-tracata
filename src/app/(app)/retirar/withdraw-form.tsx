'use client'

import * as React from 'react'
import { Banknote, CheckCircle2, TriangleAlert } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { withdrawAction } from '@/lib/actions'
import type { EstablishmentDashboard } from '@/lib/database.types'
import { decimos, formatMoney, parseMoneyToCents, todayISO } from '@/lib/money'
import { cn } from '@/lib/utils'

export function WithdrawForm({
  campaignId,
  cards,
  salesSinceWithdrawal,
  defaultEstablishmentId,
}: {
  campaignId: string
  cards: EstablishmentDashboard[]
  salesSinceWithdrawal: Record<string, number>
  defaultEstablishmentId?: string
}) {
  const [establishmentId, setEstablishmentId] = React.useState(
    defaultEstablishmentId ?? cards[0]?.establishment_id ?? '',
  )
  const [amount, setAmount] = React.useState('')

  const card = cards.find((c) => c.establishment_id === establishmentId)
  const expected = Number(card?.pending_cents ?? 0)
  const soldSince = salesSinceWithdrawal[establishmentId] ?? 0

  // Al cambiar de establecimiento se propone retirar todo lo pendiente.
  React.useEffect(() => {
    setAmount(expected > 0 ? (expected / 100).toFixed(2).replace('.', ',') : '')
  }, [expected, establishmentId])

  const withdrawn = parseMoneyToCents(amount)
  const difference = withdrawn === null ? null : expected - withdrawn
  const status =
    difference === null ? 'idle' : difference === 0 ? 'ok' : difference > 0 ? 'short' : 'over'

  return (
    <ActionForm action={withdrawAction} resetOnSuccess={false}>
      {(state) => (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <input type="hidden" name="campaign_id" value={campaignId} />

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
                {cards.map((option) => (
                  <option key={option.establishment_id} value={option.establishment_id}>
                    {option.establishment_name} — {formatMoney(option.pending_cents)} pendientes
                  </option>
                ))}
              </Select>
            </Field>

            {card ? (
              <div className="rounded-xl bg-secondary/70 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dinero a retirar
                </p>
                <p className="tabular mt-1 text-4xl font-bold">{formatMoney(expected)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {soldSince > 0
                    ? `Se han vendido ${decimos(soldSince)} desde la última retirada.`
                    : 'No se ha vendido nada desde la última retirada.'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deberías encontrar {formatMoney(expected)} en la caja de lotería de{' '}
                  {card.establishment_name}.
                </p>
              </div>
            ) : null}

            <Field
              label="¿Cuánto dinero has recogido?"
              htmlFor="amount"
              error={state.fieldErrors?.amount}
              hint="Escribe lo que realmente te llevas, aunque no coincida."
            >
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                className="h-14 text-center text-2xl font-semibold"
              />
            </Field>

            {/* ------------------------------ Semáforo de cuadre */}
            {status !== 'idle' && withdrawn !== null ? (
              <div
                className={cn(
                  'space-y-2 rounded-xl p-4',
                  status === 'ok' && 'bg-success/10 text-success',
                  status === 'short' && 'bg-warning/10 text-warning',
                  status === 'over' && 'bg-destructive/10 text-destructive',
                )}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {status === 'ok' ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <TriangleAlert className="size-5" />
                  )}
                  {status === 'ok'
                    ? 'Cuadre correcto'
                    : status === 'short'
                      ? `Faltan ${formatMoney(difference!)}`
                      : `Son ${formatMoney(-difference!)} más de lo pendiente`}
                </div>
                <div className="space-y-0.5 text-sm text-foreground/80">
                  <div className="flex justify-between">
                    <span>Esperado</span>
                    <span className="tabular font-medium">{formatMoney(expected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Retirado</span>
                    <span className="tabular font-medium">{formatMoney(withdrawn)}</span>
                  </div>
                  {status !== 'ok' ? (
                    <div className="flex justify-between border-t pt-1">
                      <span>Seguirá pendiente</span>
                      <span className="tabular font-semibold">{formatMoney(difference!)}</span>
                    </div>
                  ) : null}
                </div>
                {status === 'short' ? (
                  <p className="text-xs">
                    La diferencia no se borra: se queda como pendiente en este establecimiento.
                  </p>
                ) : null}
                {status === 'over' ? (
                  <p className="text-xs">
                    No se puede recoger más de lo que consta pendiente. Si el descuadre es real,
                    usa «La caja del bar no cuadra» para dejar constancia del motivo.
                  </p>
                ) : null}
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

            <div className="flex flex-col gap-2 sm:flex-row">
              {expected > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="sm:flex-1"
                  onClick={() => setAmount((expected / 100).toFixed(2).replace('.', ','))}
                >
                  Retirar todo ({formatMoney(expected)})
                </Button>
              ) : null}
              <SubmitButton
                size="lg"
                className="sm:flex-1"
                disabled={!card || withdrawn === null || status === 'over'}
              >
                <Banknote /> Registrar retirada
              </SubmitButton>
            </div>
          </CardContent>
        </Card>
      )}
    </ActionForm>
  )
}
