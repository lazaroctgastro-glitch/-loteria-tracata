'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { saveCampaignAction } from '@/lib/actions'
import type { Campaign } from '@/lib/database.types'
import { formatMoney, parseMoneyToCents } from '@/lib/money'

const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function CampaignEditor({
  mode,
  campaign,
}: {
  mode: 'create' | 'edit'
  campaign?: Campaign
}) {
  const [open, setOpen] = React.useState(false)
  const [purchase, setPurchase] = React.useState(toInput(campaign?.purchase_price_cents ?? 2000))
  const [sale, setSale] = React.useState(toInput(campaign?.sale_price_cents ?? 2300))

  const purchaseCents = parseMoneyToCents(purchase)
  const saleCents = parseMoneyToCents(sale)
  const commission =
    purchaseCents !== null && saleCents !== null ? saleCents - purchaseCents : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button>
            <Plus /> Nueva campaña
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full">
            Editar campaña
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nueva campaña' : campaign?.name}</DialogTitle>
          <DialogDescription>
            Los precios se guardan en la campaña, así que puedes cambiarlos de un año para otro sin
            tocar el histórico.
          </DialogDescription>
        </DialogHeader>

        <ActionForm action={saveCampaignAction} resetOnSuccess={false} onSuccess={() => setOpen(false)}>
          {(state) => (
            <>
              {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
              <Field label="Nombre" htmlFor="campaign_name" error={state.fieldErrors?.name}>
                <Input
                  id="campaign_name"
                  name="name"
                  defaultValue={campaign?.name ?? `Lotería de Navidad ${new Date().getFullYear()}`}
                  required
                />
              </Field>
              <Field label="Año" htmlFor="campaign_year" error={state.fieldErrors?.year}>
                <Input
                  id="campaign_year"
                  name="year"
                  type="number"
                  defaultValue={campaign?.year ?? new Date().getFullYear()}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Precio de compra"
                  htmlFor="purchase_price"
                  error={state.fieldErrors?.purchase_price}
                >
                  <Input
                    id="purchase_price"
                    name="purchase_price"
                    inputMode="decimal"
                    value={purchase}
                    onChange={(event) => setPurchase(event.target.value)}
                    required
                  />
                </Field>
                <Field
                  label="Precio de venta"
                  htmlFor="sale_price"
                  error={state.fieldErrors?.sale_price}
                >
                  <Input
                    id="sale_price"
                    name="sale_price"
                    inputMode="decimal"
                    value={sale}
                    onChange={(event) => setSale(event.target.value)}
                    required
                  />
                </Field>
              </div>

              <p className="rounded-lg bg-secondary p-3 text-sm">
                {commission === null
                  ? 'Escribe los dos precios para ver cuánto se aporta a la fiesta.'
                  : commission < 0
                    ? 'El precio de venta no puede ser menor que el de compra.'
                    : `Cada décimo vendido aportará ${formatMoney(commission)} al Fondo Fiesta.`}
              </p>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_default"
                  defaultChecked={campaign?.is_default ?? true}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                Es la campaña que se está usando
              </label>

              <SubmitButton className="w-full">Guardar</SubmitButton>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
