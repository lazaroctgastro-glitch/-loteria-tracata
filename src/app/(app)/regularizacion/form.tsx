'use client'

import * as React from 'react'
import { Flag } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { openingBalancesAction } from '@/lib/actions'
import type { EstablishmentDashboard } from '@/lib/database.types'
import { formatMoney, parseMoneyToCents, todayISO } from '@/lib/money'

/** Diferencia entre lo que consta y lo que el usuario dice que hay de verdad. */
function Difference({ current, typed }: { current: number; typed: string }) {
  if (typed.trim() === '') return null
  const target = parseMoneyToCents(typed)
  if (target === null) return null
  const delta = target - current
  if (delta === 0) {
    return <p className="text-xs font-medium text-success">Coincide con lo que consta.</p>
  }
  return (
    <p className="text-xs text-muted-foreground">
      Se apuntará un ajuste de{' '}
      <strong className={delta > 0 ? 'text-success' : 'text-destructive'}>
        {delta > 0 ? '+' : '−'}
        {formatMoney(Math.abs(delta))}
      </strong>{' '}
      para llegar a esa cifra.
    </p>
  )
}

export function OpeningBalancesForm({
  campaignId,
  cards,
  currentDebtCents,
  currentCashCents,
}: {
  campaignId: string
  cards: EstablishmentDashboard[]
  currentDebtCents: number
  currentCashCents: number
}) {
  const [debt, setDebt] = React.useState('')
  const [cash, setCash] = React.useState('')
  const [pending, setPending] = React.useState<Record<string, string>>({})

  return (
    <ActionForm action={openingBalancesAction} resetOnSuccess={false}>
      {(state) => (
        <div className="space-y-4">
          <input type="hidden" name="campaign_id" value={campaignId} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Con la administración</CardTitle>
              <CardDescription>¿Cuánto les debías al empezar?</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 rounded-lg bg-secondary p-3 text-sm">
                Ahora mismo consta que debes{' '}
                <strong className="tabular">{formatMoney(currentDebtCents)}</strong>.
              </p>
              <Field
                label="¿Cuánto debes en realidad?"
                htmlFor="supplier_debt"
                hint="Déjalo vacío para no tocarlo."
                error={state.fieldErrors?.supplier_debt}
              >
                <Input
                  id="supplier_debt"
                  name="supplier_debt"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={debt}
                  onChange={(event) => setDebt(event.target.value)}
                  className="h-14 text-center text-2xl font-semibold"
                />
              </Field>
              <Difference current={currentDebtCents} typed={debt} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">En tu caja</CardTitle>
              <CardDescription>
                Dinero de la lotería que ya tenías guardado al empezar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 rounded-lg bg-secondary p-3 text-sm">
                Ahora mismo consta que tienes{' '}
                <strong className="tabular">{formatMoney(currentCashCents)}</strong>.
              </p>
              <Field
                label="¿Cuánto dinero tienes en realidad?"
                htmlFor="central_cash"
                hint="Déjalo vacío para no tocarlo."
                error={state.fieldErrors?.central_cash}
              >
                <Input
                  id="central_cash"
                  name="central_cash"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                  className="h-14 text-center text-2xl font-semibold"
                />
              </Field>
              <Difference current={currentCashCents} typed={cash} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">En los bares</CardTitle>
              <CardDescription>
                Dinero de lotería ya vendida que cada bar tenía guardado y todavía no habías
                recogido.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cards.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay establecimientos.</p>
              ) : (
                cards.map((card) => (
                  <div key={card.establishment_id} className="space-y-1 border-b pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {card.establishment_name}
                      </span>
                      <Input
                        aria-label={`Dinero pendiente en ${card.establishment_name}`}
                        name={`pending_${card.establishment_id}`}
                        inputMode="decimal"
                        placeholder="Sin tocar"
                        className="h-12 w-32 text-right"
                        value={pending[card.establishment_id] ?? ''}
                        onChange={(event) =>
                          setPending((current) => ({
                            ...current,
                            [card.establishment_id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Consta {formatMoney(card.pending_cents)}
                    </p>
                    <Difference
                      current={Number(card.pending_cents)}
                      typed={pending[card.establishment_id] ?? ''}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fecha de estos saldos" htmlFor="opening_date">
                  <Input
                    id="opening_date"
                    name="occurred_on"
                    type="date"
                    defaultValue={todayISO()}
                  />
                </Field>
                <Field label="Observaciones" htmlFor="opening_notes">
                  <Input id="opening_notes" name="notes" placeholder="Opcional" />
                </Field>
              </div>

              <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                Escribe los importes reales, no las diferencias. Los campos que dejes vacíos no se
                tocan. Esto solo se puede hacer una vez por campaña: repásalo antes de guardar,
                porque si te equivocas tendrás que anularlo desde Movimientos.
              </p>

              <SubmitButton size="lg" className="w-full">
                <Flag /> Guardar los saldos iniciales
              </SubmitButton>
            </CardContent>
          </Card>
        </div>
      )}
    </ActionForm>
  )
}
