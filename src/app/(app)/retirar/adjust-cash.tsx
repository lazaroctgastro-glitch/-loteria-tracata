'use client'

import * as React from 'react'
import { Wallet } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { adjustEstablishmentCashAction } from '@/lib/actions'
import type { EstablishmentDashboard } from '@/lib/database.types'
import { formatMoney, todayISO } from '@/lib/money'

/**
 * Para cuando la caja de un bar no cuadra por un motivo que no es una venta ni
 * una recogida: un error al apuntar, dinero que apareció después, etc.
 * Siempre exige motivo y queda en el histórico.
 */
export function AdjustCashDialog({
  campaignId,
  cards,
  defaultEstablishmentId,
}: {
  campaignId: string
  cards: EstablishmentDashboard[]
  defaultEstablishmentId?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [establishmentId, setEstablishmentId] = React.useState(
    defaultEstablishmentId ?? cards[0]?.establishment_id ?? '',
  )

  const card = cards.find((c) => c.establishment_id === establishmentId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full">
          <Wallet /> La caja del bar no cuadra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir la caja de un bar</DialogTitle>
          <DialogDescription>
            Solo para descuadres que no son ventas ni recogidas. Queda registrado con el motivo.
          </DialogDescription>
        </DialogHeader>

        <ActionForm action={adjustEstablishmentCashAction} onSuccess={() => setOpen(false)}>
          {(state) => (
            <>
              <input type="hidden" name="campaign_id" value={campaignId} />

              <Field label="Establecimiento" htmlFor="adjust_cash_est">
                <Select
                  id="adjust_cash_est"
                  name="establishment_id"
                  value={establishmentId}
                  onChange={(event) => setEstablishmentId(event.target.value)}
                  required
                >
                  {cards.map((option) => (
                    <option key={option.establishment_id} value={option.establishment_id}>
                      {option.establishment_name}
                    </option>
                  ))}
                </Select>
              </Field>

              {card ? (
                <p className="rounded-lg bg-secondary p-3 text-sm">
                  Ahora mismo consta que tiene{' '}
                  <strong className="tabular">{formatMoney(card.pending_cents)}</strong> pendientes.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Qué pasa" htmlFor="adjust_cash_dir">
                  <Select id="adjust_cash_dir" name="direction" defaultValue="add">
                    <option value="add">Debe más de lo que consta</option>
                    <option value="subtract">Debe menos de lo que consta</option>
                  </Select>
                </Field>
                <Field
                  label="Diferencia"
                  htmlFor="adjust_cash_amount"
                  error={state.fieldErrors?.amount}
                >
                  <Input
                    id="adjust_cash_amount"
                    name="amount"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                  />
                </Field>
              </div>

              <Field label="Motivo" htmlFor="adjust_cash_reason" error={state.fieldErrors?.reason}>
                <Input
                  id="adjust_cash_reason"
                  name="reason"
                  placeholder="Se apuntó mal una venta, apareció dinero…"
                  required
                />
              </Field>

              <Field label="Fecha" htmlFor="adjust_cash_date">
                <Input id="adjust_cash_date" name="occurred_on" type="date" defaultValue={todayISO()} />
              </Field>

              <SubmitButton className="w-full">Registrar la corrección</SubmitButton>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
