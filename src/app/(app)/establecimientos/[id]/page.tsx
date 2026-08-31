import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Banknote, ClipboardCheck, Receipt, Truck } from 'lucide-react'
import { MovementList } from '@/components/movement-list'
import { NoCampaign } from '@/components/no-campaign'
import { DataRow, EmptyState, PageHeader, Stat } from '@/components/stat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import {
  getActiveCampaign,
  getEstablishment,
  getEstablishmentCard,
  getEstablishmentStock,
  getMovements,
} from '@/lib/data'
import { decimos, formatDate, formatMoney, formatNumber } from '@/lib/money'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const establishment = await getEstablishment(id)
  return { title: establishment?.name ?? 'Establecimiento' }
}

export default async function EstablishmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  // La RLS impide leer un establecimiento que no te corresponde.
  const establishment = await getEstablishment(id)
  if (!establishment) notFound()

  const [card, stock, movements] = await Promise.all([
    getEstablishmentCard(campaign.id, id),
    getEstablishmentStock(campaign.id, id),
    getMovements({ campaignId: campaign.id, establishmentId: id, limit: 100 }),
  ])

  const pending = Number(card?.pending_cents ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={establishment.name}
        description={establishment.manager_name ? `Responsable: ${establishment.manager_name}` : undefined}
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Caja pendiente de recoger
          </p>
          <p className="tabular mt-1 text-4xl font-bold">{formatMoney(pending)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {pending > 0
              ? `Deberías encontrar ${formatMoney(pending)} en su caja de lotería.`
              : pending === 0
                ? 'No hay nada pendiente de recoger.'
                : `Se ha retirado ${formatMoney(-pending)} de más.`}
          </p>
          {card?.last_withdrawal_on ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Última retirada: {formatDate(card.last_withdrawal_on)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button asChild className="h-auto flex-col gap-1.5 py-4 text-xs">
          <Link href={`/vender?establecimiento=${id}`}>
            <Receipt className="size-5" /> Vender
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto flex-col gap-1.5 py-4 text-xs">
          <Link href={`/recuento?establecimiento=${id}`}>
            <ClipboardCheck className="size-5" /> Recuento
          </Link>
        </Button>
        {user.isAdmin ? (
          <>
            <Button asChild variant="outline" className="h-auto flex-col gap-1.5 py-4 text-xs">
              <Link href={`/entregar?establecimiento=${id}`}>
                <Truck className="size-5" /> Entregar
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto flex-col gap-1.5 py-4 text-xs">
              <Link href={`/retirar?establecimiento=${id}`}>
                <Banknote className="size-5" /> Retirar
              </Link>
            </Button>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Décimos entregados" value={formatNumber(card?.delivered_qty ?? 0)} size="sm" />
        <Stat label="Le quedan" value={formatNumber(card?.stock_qty ?? 0)} size="sm" tone="primary" />
        <Stat label="Ha vendido" value={formatNumber(card?.sold_qty ?? 0)} size="sm" />
        <Stat
          label="Aporta a la fiesta"
          value={formatMoney(card?.commission_cents ?? 0)}
          size="sm"
          tone="success"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Décimos que tiene ahora</CardTitle>
          </CardHeader>
          <CardContent>
            {stock.length === 0 ? (
              <EmptyState title="No le queda ningún décimo." />
            ) : (
              <>
                <ul className="divide-y">
                  {stock.map((row) => (
                    <li key={row.lottery_number_id} className="flex justify-between py-2">
                      <span className="tabular font-medium">{row.number}</span>
                      <span className="tabular">{decimos(row.qty)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                  Quedan {decimos(card?.stock_qty ?? 0)} en este establecimiento.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cuentas del establecimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <DataRow label="Ha vendido" value={formatMoney(card?.revenue_cents ?? 0)} strong />
            <DataRow label="Coste de lo vendido" value={formatMoney(card?.capital_cents ?? 0)} />
            <DataRow
              label="Para el Fondo Fiesta"
              value={formatMoney(card?.commission_cents ?? 0)}
              tone="success"
            />
            <div className="mt-3 border-t pt-3">
              <DataRow label="Ya recogido" value={formatMoney(card?.withdrawn_cents ?? 0)} />
              <DataRow
                label="Pendiente de recoger"
                value={formatMoney(pending)}
                strong
                tone={pending > 0 ? 'warning' : pending < 0 ? 'destructive' : 'success'}
              />
            </div>
            {(card?.returned_qty ?? 0) > 0 ? (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Ha devuelto {decimos(card?.returned_qty ?? 0)} al almacén central.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Movimientos
        </h2>
        <MovementList movements={movements} canVoid={user.isAdmin} />
      </section>
    </div>
  )
}
