'use client'

import * as React from 'react'
import {
  Banknote,
  Boxes,
  ClipboardCheck,
  PartyPopper,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Truck,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Input } from '@/components/ui/input'
import { voidMovementAction } from '@/lib/actions'
import { MOVEMENT_LABELS, type MovementDetailed, type MovementType } from '@/lib/database.types'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money'
import { cn } from '@/lib/utils'

const ICONS: Record<MovementType, React.ElementType> = {
  purchase: ShoppingCart,
  capital_injection: PiggyBank,
  delivery: Truck,
  return: Undo2,
  sale: Receipt,
  count: ClipboardCheck,
  adjustment: Boxes,
  withdrawal: Banknote,
  fund_expense: PartyPopper,
}

/** Frase en lenguaje natural que describe el movimiento. */
function describe(movement: MovementDetailed): string {
  const qty = Math.abs(movement.quantity)
  const amount = formatMoney(Math.abs(movement.amount_cents))
  const number = movement.lottery_number ? `del número ${movement.lottery_number}` : ''
  const place = movement.establishment_name ?? ''

  switch (movement.type) {
    case 'purchase':
      return `Compra de ${formatNumber(qty)} décimos ${number} por ${amount}`
    case 'capital_injection':
      return `${movement.concept ?? 'Aportación'} de ${amount} a la caja central`
    case 'delivery':
      return `Entrega de ${formatNumber(qty)} décimos ${number} a ${place}`
    case 'return':
      return `Devolución de ${formatNumber(qty)} décimos ${number} desde ${place}`
    case 'sale':
      return `Venta de ${formatNumber(qty)} décimos ${number} en ${place} por ${amount}`
    case 'count':
      return `Recuento de lotería en ${place}`
    case 'adjustment':
      return `${movement.concept ?? 'Ajuste'}: ${formatNumber(qty)} décimos ${number}${place ? ` en ${place}` : ' en el almacén'}`
    case 'withdrawal':
      return `Retirada de ${amount} de ${place}`
    case 'fund_expense':
      return `Gasto del Fondo Fiesta: ${movement.concept} (${amount})`
  }
}

export function MovementList({
  movements,
  canVoid,
  emptyMessage = 'Todavía no hay movimientos.',
}: {
  movements: MovementDetailed[]
  canVoid: boolean
  emptyMessage?: string
}) {
  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {movements.map((movement) => {
        const Icon = ICONS[movement.type]
        const voided = movement.reversed_by_movement_id !== null
        return (
          <li key={movement.id} className="flex items-start gap-3 p-4">
            <span
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                movement.is_reversal
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', voided && 'text-muted-foreground line-through')}>
                {movement.is_reversal ? 'ANULACIÓN · ' : ''}
                {describe(movement)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(movement.created_at)}
                {movement.created_by_name ? ` · ${movement.created_by_name}` : ''}
                {movement.notes ? ` · ${movement.notes}` : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{MOVEMENT_LABELS[movement.type]}</Badge>
                {voided ? <Badge variant="destructive">Anulado</Badge> : null}
                {movement.d_commission_cents !== 0 ? (
                  <Badge variant="success">
                    Fondo Fiesta {movement.d_commission_cents > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(movement.d_commission_cents))}
                  </Badge>
                ) : null}
              </div>
            </div>

            {canVoid && !voided && !movement.is_reversal ? (
              <VoidButton movement={movement} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function VoidButton({ movement }: { movement: MovementDetailed }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
          Anular
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular este movimiento</DialogTitle>
          <DialogDescription>
            El movimiento no se borra: se crea otro que lo deja sin efecto, para que en el histórico
            siempre se vea qué pasó.
            {movement.group_id
              ? ' Como forma parte de una operación con varias líneas, se anulará la operación completa.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-secondary p-3 text-sm">{describe(movement)}</p>
        <ActionForm action={voidMovementAction} onSuccess={() => setOpen(false)}>
          <input type="hidden" name="movement_id" value={movement.id} />
          <Field label="Motivo" htmlFor={`reason-${movement.id}`}>
            <Input id={`reason-${movement.id}`} name="reason" placeholder="Me equivoqué al apuntarlo" />
          </Field>
          <SubmitButton variant="destructive" className="w-full">
            Anular movimiento
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
