import Link from 'next/link'
import { NoCampaign } from '@/components/no-campaign'
import { EmptyState, PageHeader } from '@/components/stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign, getEstablishmentCards, getEstablishments } from '@/lib/data'
import { formatMoney, formatNumber } from '@/lib/money'
import { EstablishmentEditor } from './establishment-editor'

export const metadata = { title: 'Establecimientos' }

export default async function EstablishmentsPage() {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [establishments, cards] = await Promise.all([
    getEstablishments(),
    getEstablishmentCards(campaign.id),
  ])
  const cardsById = new Map(cards.map((card) => [card.establishment_id, card]))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Establecimientos"
        description="Los bares y restaurantes donde se vende la lotería."
      >
        {user.isAdmin ? <EstablishmentEditor mode="create" /> : null}
      </PageHeader>

      {establishments.length === 0 ? (
        <EmptyState
          title="Todavía no hay establecimientos."
          description={user.isAdmin ? 'Crea el primero para empezar a repartir lotería.' : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {establishments.map((establishment) => {
            const card = cardsById.get(establishment.id)
            const hasMovements = Boolean(
              card && (card.delivered_qty !== 0 || card.sold_qty !== 0 || card.withdrawn_cents !== 0),
            )
            return (
              <Card key={establishment.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/establecimientos/${establishment.id}`}
                        className="font-semibold hover:underline"
                      >
                        {establishment.name}
                      </Link>
                      {establishment.manager_name ? (
                        <p className="text-xs text-muted-foreground">
                          Responsable: {establishment.manager_name}
                        </p>
                      ) : null}
                    </div>
                    {establishment.is_active ? null : <Badge variant="secondary">Archivado</Badge>}
                  </div>

                  {card ? (
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="tabular font-semibold">{formatNumber(card.stock_qty)}</p>
                        <p className="text-[11px] uppercase text-muted-foreground">Quedan</p>
                      </div>
                      <div>
                        <p className="tabular font-semibold">{formatNumber(card.sold_qty)}</p>
                        <p className="text-[11px] uppercase text-muted-foreground">Vendidos</p>
                      </div>
                      <div>
                        <p className="tabular font-semibold text-primary">
                          {formatMoney(card.pending_cents)}
                        </p>
                        <p className="text-[11px] uppercase text-muted-foreground">Pendiente</p>
                      </div>
                    </div>
                  ) : null}

                  {establishment.notes ? (
                    <p className="text-sm text-muted-foreground">{establishment.notes}</p>
                  ) : null}

                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/establecimientos/${establishment.id}`}>Ver detalle</Link>
                    </Button>
                    {user.isAdmin ? (
                      <EstablishmentEditor
                        mode="edit"
                        establishment={establishment}
                        canDelete={!hasMovements}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
