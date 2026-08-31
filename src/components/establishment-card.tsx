import Link from 'next/link'
import { ArrowRight, Banknote, ClipboardCheck, Receipt, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { decimos, formatMoney, formatNumber } from '@/lib/money'
import type { EstablishmentDashboard } from '@/lib/database.types'
import { cn } from '@/lib/utils'

export function EstablishmentCard({
  data,
  isAdmin,
}: {
  data: EstablishmentDashboard
  isAdmin: boolean
}) {
  const pending = Number(data.pending_cents)
  // El dato más importante de la tarjeta: lo que hay que ir a recoger.
  const pendingTone =
    pending < 0 ? 'text-destructive' : pending > 0 ? 'text-primary' : 'text-success'

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/establecimientos/${data.establishment_id}`} className="hover:underline">
              <h3 className="text-lg font-bold leading-tight">{data.establishment_name}</h3>
            </Link>
            {data.manager_name ? (
              <p className="text-xs text-muted-foreground">{data.manager_name}</p>
            ) : null}
          </div>
          {!data.is_active ? <Badge variant="secondary">Archivado</Badge> : null}
        </div>

        {/* ------------------------------------------ Dato principal */}
        <div className="rounded-xl bg-secondary/70 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Caja pendiente de recoger
          </p>
          <p className={cn('tabular mt-1 text-4xl font-bold leading-none', pendingTone)}>
            {formatMoney(pending)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {pending > 0
              ? `Deberías encontrar ${formatMoney(pending)} en su caja de lotería`
              : pending === 0
                ? 'Todo recogido, no hay nada pendiente'
                : `Has retirado ${formatMoney(-pending)} de más`}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Entregados" value={formatNumber(data.delivered_qty)} />
          <Metric label="Quedan" value={formatNumber(data.stock_qty)} highlight />
          <Metric label="Vendidos" value={formatNumber(data.sold_qty)} />
        </div>

        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ha vendido</span>
            <span className="tabular font-medium">{formatMoney(data.revenue_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Aporta al Fondo Fiesta</span>
            <span className="tabular font-medium text-success">
              {formatMoney(data.commission_cents)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ya retirado</span>
            <span className="tabular font-medium">{formatMoney(data.withdrawn_cents)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Quedan {decimos(data.stock_qty)} en este establecimiento.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="default" size="sm" className="h-10">
            <Link href={`/vender?establecimiento=${data.establishment_id}`}>
              <Receipt /> Vender
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-10">
            <Link href={`/recuento?establecimiento=${data.establishment_id}`}>
              <ClipboardCheck /> Recuento
            </Link>
          </Button>
          {isAdmin ? (
            <>
              <Button asChild variant="outline" size="sm" className="h-10">
                <Link href={`/entregar?establecimiento=${data.establishment_id}`}>
                  <Truck /> Entregar
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-10">
                <Link href={`/retirar?establecimiento=${data.establishment_id}`}>
                  <Banknote /> Retirar
                </Link>
              </Button>
            </>
          ) : null}
          <Button asChild variant="ghost" size="sm" className="col-span-2 h-10">
            <Link href={`/establecimientos/${data.establishment_id}`}>
              Ver movimientos <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-2', highlight && 'border-primary/30 bg-primary/5')}>
      <p className="tabular text-xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
