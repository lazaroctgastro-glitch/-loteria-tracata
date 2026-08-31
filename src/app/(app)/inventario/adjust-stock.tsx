'use client'

import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
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
import { adjustStockAction } from '@/lib/actions'
import type { Establishment, LotteryNumber } from '@/lib/database.types'
import { todayISO } from '@/lib/money'

/**
 * Corrige el inventario cuando la realidad no coincide con la aplicación por
 * un motivo que no es una venta: un décimo roto, perdido o apuntado de más.
 * Siempre exige un motivo y deja movimiento en el histórico.
 */
export function AdjustStockDialog({
  numbers,
  establishments,
}: {
  numbers: LotteryNumber[]
  establishments: Establishment[]
}) {
  const [open, setOpen] = React.useState(false)
  const [direction, setDirection] = React.useState<'-' | '+'>('-')
  const [quantity, setQuantity] = React.useState('1')

  const delta = Number(quantity) > 0 ? Number(direction + quantity) : 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Corregir inventario
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir el inventario</DialogTitle>
          <DialogDescription>
            Solo para casos que no son ventas: un décimo roto, perdido o apuntado por error. Queda
            registrado en el histórico con el motivo.
          </DialogDescription>
        </DialogHeader>

        <ActionForm action={adjustStockAction} onSuccess={() => setOpen(false)}>
          {(state) => (
            <>
              <input type="hidden" name="delta_qty" value={delta} />

              <Field
                label="Número de lotería"
                htmlFor="adjust_number"
                error={state.fieldErrors?.lottery_number_id}
              >
                <Select id="adjust_number" name="lottery_number_id" required>
                  {numbers.map((number) => (
                    <option key={number.id} value={number.id}>
                      {number.number}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="¿Dónde está el descuadre?" htmlFor="adjust_place">
                <Select id="adjust_place" name="establishment_id" defaultValue="">
                  <option value="">En el almacén central</option>
                  {establishments.map((establishment) => (
                    <option key={establishment.id} value={establishment.id}>
                      En {establishment.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Qué ha pasado" htmlFor="adjust_direction">
                  <Select
                    id="adjust_direction"
                    value={direction}
                    onChange={(event) => setDirection(event.target.value as '-' | '+')}
                  >
                    <option value="-">Faltan décimos</option>
                    <option value="+">Sobran décimos</option>
                  </Select>
                </Field>
                <Field label="¿Cuántos?" htmlFor="adjust_qty" error={state.fieldErrors?.delta_qty}>
                  <Input
                    id="adjust_qty"
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field label="Motivo" htmlFor="adjust_reason" error={state.fieldErrors?.reason}>
                <Input
                  id="adjust_reason"
                  name="reason"
                  placeholder="Décimo roto, se moja, se pierde…"
                  required
                />
              </Field>

              <Field label="Fecha" htmlFor="adjust_date">
                <Input id="adjust_date" name="occurred_on" type="date" defaultValue={todayISO()} />
              </Field>

              <p className="rounded-lg bg-warning/10 p-3 text-xs font-medium text-warning">
                Esto no registra ninguna venta ni mueve dinero: solo corrige cuántos décimos hay.
              </p>

              <SubmitButton className="w-full" disabled={delta === 0}>
                Registrar la corrección
              </SubmitButton>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
