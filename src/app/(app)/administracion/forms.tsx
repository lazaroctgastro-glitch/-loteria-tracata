'use client'

import * as React from 'react'
import { CornerUpLeft, HandCoins, TriangleAlert } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { paySupplierAction, returnToSupplierAction } from '@/lib/actions'
import type { StockCentralRow } from '@/lib/database.types'
import { decimos, formatMoney, parseMoneyToCents, todayISO } from '@/lib/money'

const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function PaySupplierForm({
  campaignId,
  debtCents,
  cashCents,
}: {
  campaignId: string
  debtCents: number
  cashCents: number
}) {
  const [amount, setAmount] = React.useState('')
  const cents = parseMoneyToCents(amount)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pagar a la administración</CardTitle>
        <CardDescription>
          El dinero sale de la caja central y baja lo que debes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={paySupplierAction} onSuccess={() => setAmount('')}>
          {(state) => (
            <>
              <input type="hidden" name="campaign_id" value={campaignId} />

              <Field label="¿Cuánto pagas?" htmlFor="pay_amount" error={state.fieldErrors?.amount}>
                <Input
                  id="pay_amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  className="h-14 text-center text-2xl font-semibold"
                />
              </Field>

              {debtCents > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setAmount(toInput(debtCents))}
                >
                  Pagar todo lo que debo ({formatMoney(debtCents)})
                </Button>
              ) : null}

              {cents !== null && cents > cashCents ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs font-medium text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    En la caja central solo hay {formatMoney(cashCents)}. Puedes registrarlo igual si
                    el dinero salió de otro sitio, pero la caja quedará en negativo.
                  </span>
                </p>
              ) : null}

              {cents !== null && cents > 0 ? (
                <p className="rounded-lg bg-secondary p-3 text-sm">
                  Después del pago quedarás debiendo{' '}
                  <strong className="tabular">{formatMoney(Math.max(debtCents - cents, 0))}</strong>
                  {debtCents - cents < 0
                    ? ` y tendrás ${formatMoney(cents - debtCents)} a tu favor`
                    : ''}
                  .
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Forma de pago" htmlFor="pay_method">
                  <Input id="pay_method" name="method" placeholder="Efectivo, transferencia…" />
                </Field>
                <Field label="Fecha" htmlFor="pay_date">
                  <Input id="pay_date" name="occurred_on" type="date" defaultValue={todayISO()} />
                </Field>
              </div>

              <Field label="Observaciones" htmlFor="pay_notes">
                <Input id="pay_notes" name="notes" placeholder="Opcional" />
              </Field>

              <SubmitButton size="lg" className="w-full">
                <HandCoins /> Registrar el pago
              </SubmitButton>
            </>
          )}
        </ActionForm>
      </CardContent>
    </Card>
  )
}

export function ReturnToSupplierForm({
  stock,
  purchasePriceCents,
}: {
  stock: StockCentralRow[]
  purchasePriceCents: number
}) {
  const [numberId, setNumberId] = React.useState(stock[0]?.lottery_number_id ?? '')
  const [quantity, setQuantity] = React.useState('')

  const selected = stock.find((row) => row.lottery_number_id === numberId)
  const qty = Number(quantity)
  const validQty = Number.isInteger(qty) && qty > 0
  const tooMany = Boolean(selected) && validQty && qty > selected!.qty

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Devolver lotería a la administración</CardTitle>
        <CardDescription>
          Los décimos salen del almacén y dejas de deberlos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stock.length === 0 ? (
          <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
            No queda ningún décimo en el almacén central para devolver.
          </p>
        ) : (
          <ActionForm action={returnToSupplierAction} onSuccess={() => setQuantity('')}>
            {(state) => (
              <>
                <Field
                  label="Número de lotería"
                  htmlFor="return_number"
                  error={state.fieldErrors?.lottery_number_id}
                >
                  <Select
                    id="return_number"
                    name="lottery_number_id"
                    value={numberId}
                    onChange={(event) => setNumberId(event.target.value)}
                    required
                  >
                    {stock.map((row) => (
                      <option key={row.lottery_number_id} value={row.lottery_number_id}>
                        {row.number} — hay {row.qty} en el almacén
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="¿Cuántos décimos devuelves?"
                  htmlFor="return_qty"
                  error={
                    state.fieldErrors?.quantity ?? (tooMany ? `Solo hay ${selected?.qty}` : undefined)
                  }
                >
                  <Input
                    id="return_qty"
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

                {validQty && !tooMany ? (
                  <p className="rounded-lg bg-secondary p-3 text-sm">
                    Dejarás de deber{' '}
                    <strong className="tabular">{formatMoney(qty * purchasePriceCents)}</strong> y en
                    el almacén quedarán {decimos((selected?.qty ?? 0) - qty)}.
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha" htmlFor="return_date">
                    <Input id="return_date" name="occurred_on" type="date" defaultValue={todayISO()} />
                  </Field>
                  <Field label="Observaciones" htmlFor="return_notes">
                    <Input id="return_notes" name="notes" placeholder="Opcional" />
                  </Field>
                </div>

                <SubmitButton
                  size="lg"
                  variant="outline"
                  className="w-full"
                  disabled={!selected || tooMany || !validQty}
                >
                  <CornerUpLeft /> Registrar la devolución
                </SubmitButton>
              </>
            )}
          </ActionForm>
        )}
      </CardContent>
    </Card>
  )
}
