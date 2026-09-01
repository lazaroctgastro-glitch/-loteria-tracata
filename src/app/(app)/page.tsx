import Link from 'next/link'
import { Banknote, ClipboardCheck, HandCoins, Receipt, ShoppingCart, Truck } from 'lucide-react'
import { EstablishmentCard } from '@/components/establishment-card'
import { NoCampaign } from '@/components/no-campaign'
import { Stat } from '@/components/stat'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign, getCampaignSummary, getEstablishmentCards } from '@/lib/data'
import { decimos, formatMoney, formatNumber } from '@/lib/money'

export const metadata = { title: 'Inicio' }

export default async function DashboardPage() {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, cards] = await Promise.all([
    getCampaignSummary(campaign.id),
    getEstablishmentCards(campaign.id),
  ])

  const visibleCards = cards.filter((card) => card.is_active || card.stock_qty !== 0 || card.sold_qty !== 0)
  const totalPending = visibleCards.reduce((acc, card) => acc + Number(card.pending_cents), 0)
  const toCollect = visibleCards.filter((card) => Number(card.pending_cents) > 0)

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Campaña</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{campaign.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada décimo se compra a {formatMoney(campaign.purchase_price_cents)} y se vende a{' '}
          {formatMoney(campaign.sale_price_cents)}. La diferencia de{' '}
          {formatMoney(campaign.sale_price_cents - campaign.purchase_price_cents)} va al Fondo Fiesta.
        </p>
      </header>

      {/* ------------------------------------------- Aviso destacado */}
      {totalPending > 0 ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-lg font-semibold">
              Tienes {formatMoney(totalPending)} pendientes de recoger
              {toCollect.length === 1 ? ` en ${toCollect[0].establishment_name}` : ''}.
            </p>
            {toCollect.length > 1 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Repartidos entre {toCollect.length} establecimientos:{' '}
                {toCollect
                  .map((card) => `${card.establishment_name} (${formatMoney(card.pending_cents)})`)
                  .join(', ')}
                .
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* --------------------------------------------- Accesos rápidos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickAction href="/vender" icon={<Receipt />} label="Registrar venta" primary />
        <QuickAction href="/recuento" icon={<ClipboardCheck />} label="Recuento" />
        {user.isAdmin ? <QuickAction href="/retirar" icon={<Banknote />} label="Retirar dinero" /> : null}
        {user.isAdmin ? <QuickAction href="/entregar" icon={<Truck />} label="Entregar lotería" /> : null}
        {user.isAdmin ? <QuickAction href="/comprar" icon={<ShoppingCart />} label="Recibir lotería" /> : null}
        {user.isAdmin ? (
          <QuickAction href="/administracion" icon={<HandCoins />} label="Pagar administración" />
        ) : null}
      </div>

      {/* ------------------------------------------------ Indicadores */}
      {summary ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {user.isAdmin ? 'Resumen de la campaña' : 'Resumen de tus establecimientos'}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {user.isAdmin ? (
              <>
                <Stat label="Décimos comprados" value={formatNumber(summary.purchased_qty)} />
                <Stat label="Décimos vendidos" value={formatNumber(summary.sold_qty)} tone="primary" />
                <Stat
                  label="Décimos en stock"
                  value={formatNumber(summary.total_stock_qty)}
                  hint={`${formatNumber(summary.central_stock_qty)} en el almacén · ${formatNumber(summary.establishment_stock_qty)} en los bares`}
                />
              </>
            ) : (
              <>
                <Stat label="Décimos vendidos" value={formatNumber(summary.sold_qty)} tone="primary" />
                <Stat
                  label="Décimos que te quedan"
                  value={formatNumber(summary.establishment_stock_qty)}
                />
              </>
            )}
            <Stat label="Total vendido" value={formatMoney(summary.revenue_cents)} />
            {user.isAdmin ? (
              <Stat
                label="Capital recuperado"
                value={formatMoney(summary.capital_recovered_cents)}
                hint="Lo que costó la lotería vendida"
              />
            ) : null}
            <Stat
              label="Fondo Fiesta generado"
              value={formatMoney(summary.commission_cents)}
              tone="success"
            />
          </div>

          {user.isAdmin ? (
            <>
              <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Dinero
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Stat
                  label="Pendiente en los bares"
                  value={formatMoney(summary.pending_in_establishments_cents)}
                  tone={Number(summary.pending_in_establishments_cents) > 0 ? 'warning' : 'success'}
                  hint="Vendido pero todavía sin recoger"
                />
                <Stat
                  label="Recogido de los bares"
                  value={formatMoney(summary.withdrawn_cents)}
                  hint="Total histórico"
                />
                <Stat
                  label="Caja central disponible"
                  value={formatMoney(summary.central_cash_cents)}
                  tone={Number(summary.central_cash_cents) < 0 ? 'destructive' : 'success'}
                  hint="Dinero real que tienes ahora"
                />
                <Stat
                  label="Debes a la administración"
                  value={formatMoney(summary.supplier_debt_cents)}
                  tone={Number(summary.supplier_debt_cents) > 0 ? 'destructive' : 'success'}
                  hint="Lotería retirada y aún no pagada"
                />
                <Stat
                  label="Pagado a la administración"
                  value={formatMoney(summary.supplier_paid_cents)}
                  hint="Total histórico"
                />
                <Stat
                  label="Valor del stock"
                  value={formatMoney(summary.stock_value_cents)}
                  hint={`${formatNumber(summary.total_stock_qty)} décimos a precio de coste`}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat
                label="Pendiente de recoger"
                value={formatMoney(summary.pending_in_establishments_cents)}
                tone={Number(summary.pending_in_establishments_cents) > 0 ? 'warning' : 'success'}
                hint="Lo que debería haber en la caja de lotería"
              />
            </div>
          )}
        </section>
      ) : null}

      {/* -------------------------------------- Tarjetas por bar */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {user.isAdmin ? 'Establecimientos' : 'Tu establecimiento'}
          </h2>
          {user.isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/establecimientos">Gestionar</Link>
            </Button>
          ) : null}
        </div>

        {visibleCards.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6 text-center">
              <p className="font-medium">Todavía no hay establecimientos con lotería.</p>
              {user.isAdmin ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/establecimientos">
                      <ShoppingCart /> Crear establecimientos
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/comprar">Comprar lotería</Link>
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleCards.map((card) => (
              <EstablishmentCard key={card.establishment_id} data={card} isAdmin={user.isAdmin} />
            ))}
          </div>
        )}
      </section>

      {summary && user.isAdmin ? (
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Posición de la campaña
            </p>
            <p
              className={`tabular text-2xl font-semibold ${
                Number(summary.position_cents) < 0 ? 'text-destructive' : 'text-success'
              }`}
            >
              {formatMoney(summary.position_cents)}
            </p>
            <p className="text-xs text-muted-foreground">
              Caja ({formatMoney(summary.central_cash_cents)}) + pendiente en los bares (
              {formatMoney(summary.pending_in_establishments_cents)}) + valor del stock (
              {formatMoney(summary.stock_value_cents)}) − lo que debes (
              {formatMoney(summary.supplier_debt_cents)}). Es un indicador informativo:{' '}
              <strong>no es dinero disponible</strong>. En total hay{' '}
              {decimos(summary.total_stock_qty)} sin vender.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function QuickAction({
  href,
  icon,
  label,
  primary,
}: {
  href: string
  icon: React.ReactNode
  label: string
  primary?: boolean
}) {
  return (
    <Button
      asChild
      variant={primary ? 'default' : 'outline'}
      className="h-auto flex-col gap-1.5 py-4 text-xs font-semibold"
    >
      <Link href={href}>
        <span className="[&_svg]:size-5">{icon}</span>
        {label}
      </Link>
    </Button>
  )
}
