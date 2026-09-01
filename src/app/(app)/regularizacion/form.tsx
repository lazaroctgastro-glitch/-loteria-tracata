'use client'

import * as React from 'react'
import { Flag } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { openingBalancesAction } from '@/lib/actions'
import type { Establishment } from '@/lib/database.types'
import { formatMoney, parseMoneyToCents, todayISO } from '@/lib/money'

export function OpeningBalancesForm({
  campaignId,
  establishments,
}: {
  campaignId: string
  establishments: Establishment[]
}) {
  const [debt, setDebt] = React.useState('')
  const [cash, setCash] = React.useState('')
  const [pending, setPending] = React.useState<Record<string, string>>({})

  const parse = (value: string) => (value.trim() === '' ? 0 : (parseMoneyToCents(value) ?? 0))
  const totalPending = Object.values(pending).reduce((acc, value) => acc + parse(value), 0)

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
              <Field
                label="Deuda inicial"
                htmlFor="supplier_debt"
                hint="Déjalo vacío o a 0 si no debías nada."
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
              <Field
                label="Dinero inicial en la caja central"
                htmlFor="central_cash"
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
              {establishments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay establecimientos.</p>
              ) : (
                establishments.map((establishment) => (
                  <div key={establishment.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {establishment.name}
                    </span>
                    <Input
                      aria-label={`Dinero pendiente en ${establishment.name}`}
                      name={`pending_${establishment.id}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="h-12 w-32 text-right"
                      value={pending[establishment.id] ?? ''}
                      onChange={(event) =>
                        setPending((current) => ({
                          ...current,
                          [establishment.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))
              )}
              {totalPending > 0 ? (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  Total pendiente en los bares:{' '}
                  <strong className="tabular">{formatMoney(totalPending)}</strong>
                </p>
              ) : null}
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
                Esto solo se puede hacer una vez por campaña. Repásalo antes de guardar: si te
                equivocas tendrás que anularlo desde Movimientos.
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
