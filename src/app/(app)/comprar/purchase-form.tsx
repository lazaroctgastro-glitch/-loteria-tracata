'use client'

import * as React from 'react'
import { ShoppingCart } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { purchaseAction } from '@/lib/actions'
import { formatMoney, parseMoneyToCents, todayISO } from '@/lib/money'

export function PurchaseForm({
  campaignId,
  defaultPriceCents,
  salePriceCents,
  debtCents,
}: {
  campaignId: string
  defaultPriceCents: number
  salePriceCents: number
  debtCents: number
}) {
  const [quantity, setQuantity] = React.useState('')
  const [price, setPrice] = React.useState((defaultPriceCents / 100).toFixed(2).replace('.', ','))
  const [paid, setPaid] = React.useState('')

  const qty = Number(quantity)
  const unitPrice = parseMoneyToCents(price) ?? defaultPriceCents
  const validQty = Number.isInteger(qty) && qty > 0
  const total = validQty ? qty * unitPrice : 0
  const paidCents = paid.trim() === '' ? 0 : (parseMoneyToCents(paid) ?? 0)
  const newDebt = Math.max(total - paidCents, 0)
  const paysTooMuch = validQty && paidCents > total

  return (
    <ActionForm action={purchaseAction}>
      {(state) => (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <input type="hidden" name="campaign_id" value={campaignId} />

            <Field
              label="Número de lotería"
              htmlFor="number"
              hint="Cinco cifras, por ejemplo 69588"
              error={state.fieldErrors?.number}
            >
              <Input
                id="number"
                name="number"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                placeholder="00000"
                required
                className="tabular h-14 text-center text-2xl font-semibold tracking-[0.3em]"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="¿Cuántos décimos?"
                htmlFor="quantity"
                error={state.fieldErrors?.quantity}
              >
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  className="h-14 text-center text-2xl font-semibold"
                />
              </Field>
              <Field
                label="Precio de cada décimo"
                htmlFor="unit_price"
                error={state.fieldErrors?.unit_price}
              >
                <Input
                  id="unit_price"
                  name="unit_price"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="h-14 text-center text-2xl font-semibold"
                />
              </Field>
            </div>

            <Field
              label="¿Cuánto pagas ahora?"
              htmlFor="paid_amount"
              hint="Déjalo vacío si te lo llevas todo a deber."
              error={
                state.fieldErrors?.paid_amount ??
                (paysTooMuch ? 'No puedes pagar más de lo que vale la retirada' : undefined)
              }
            >
              <Input
                id="paid_amount"
                name="paid_amount"
                inputMode="decimal"
                placeholder="0,00"
                value={paid}
                onChange={(event) => setPaid(event.target.value)}
                className="h-14 text-center text-2xl font-semibold"
              />
            </Field>

            {validQty && total > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setPaid((total / 100).toFixed(2).replace('.', ','))}
              >
                Lo pago todo ahora ({formatMoney(total)})
              </Button>
            ) : null}

            {validQty ? (
              <div className="space-y-2 rounded-xl bg-secondary/70 p-4">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Valor de la lotería que te llevas
                  </p>
                  <p className="tabular mt-1 text-3xl font-bold">{formatMoney(total)}</p>
                </div>
                <div className="space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pagas ahora</span>
                    <span className="tabular font-medium">{formatMoney(paidCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Te llevas a deber</span>
                    <span
                      className={`tabular font-semibold ${newDebt > 0 ? 'text-destructive' : 'text-success'}`}
                    >
                      {formatMoney(newDebt)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Deberás en total</span>
                    <span className="tabular font-semibold">{formatMoney(debtCents + newDebt)}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Los décimos entran en el almacén aunque no los pagues. Si los vendes todos a{' '}
                  {formatMoney(salePriceCents)}, generarán{' '}
                  {formatMoney(qty * (salePriceCents - defaultPriceCents))} para el Fondo Fiesta.
                </p>
              </div>
            ) : null}

            {validQty && unitPrice !== defaultPriceCents ? (
              <p className="rounded-lg bg-warning/10 p-3 text-xs font-medium text-warning">
                Estás pagando {formatMoney(unitPrice)} por décimo en vez de los{' '}
                {formatMoney(defaultPriceCents)} de la campaña. El reparto entre coste recuperado y
                Fondo Fiesta se sigue calculando con los precios de la campaña, así que esta compra
                dejará una diferencia de {formatMoney(Math.abs(qty * (unitPrice - defaultPriceCents)))}{' '}
                {unitPrice > defaultPriceCents ? 'de más' : 'de menos'} en la caja central. Si el
                precio ha cambiado de verdad, cámbialo en Configuración.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha" htmlFor="occurred_on" error={state.fieldErrors?.occurred_on}>
                <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
              </Field>
              <Field label="Administración" htmlFor="supplier">
                <Input id="supplier" name="supplier" placeholder="Opcional" />
              </Field>
            </div>

            <Field label="Observaciones" htmlFor="notes">
              <Input id="notes" name="notes" placeholder="Opcional" />
            </Field>

            <SubmitButton size="lg" className="w-full" disabled={!validQty || paysTooMuch}>
              <ShoppingCart /> Registrar la retirada
            </SubmitButton>
          </CardContent>
        </Card>
      )}
    </ActionForm>
  )
}
