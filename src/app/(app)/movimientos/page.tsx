import { NoCampaign } from '@/components/no-campaign'
import { MovementList } from '@/components/movement-list'
import { PageHeader } from '@/components/stat'
import { Card, CardContent } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import {
  getActiveCampaign,
  getEstablishments,
  getLotteryNumbers,
  getMovements,
  type MovementFilters,
} from '@/lib/data'
import type { MovementType } from '@/lib/database.types'
import { MovementFiltersForm } from './filters'

export const metadata = { title: 'Movimientos' }

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  const filters: MovementFilters = {
    campaignId: campaign.id,
    establishmentId: params.establecimiento || undefined,
    lotteryNumberId: params.numero || undefined,
    type: (params.tipo as MovementType) || undefined,
    from: params.desde || undefined,
    to: params.hasta || undefined,
    limit: 300,
  }

  const [movements, establishments, numbers] = await Promise.all([
    getMovements(filters),
    getEstablishments(),
    getLotteryNumbers(campaign.id),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimientos"
        description="Todo lo que ha pasado, en orden. Nada se borra nunca."
      />

      <Card>
        <CardContent className="pt-5">
          <MovementFiltersForm establishments={establishments} numbers={numbers} params={params} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {movements.length === 300
          ? 'Mostrando los 300 movimientos más recientes.'
          : `${movements.length} movimientos.`}
      </p>

      <MovementList
        movements={movements}
        canVoid={user.isAdmin}
        emptyMessage="No hay movimientos con estos filtros."
      />
    </div>
  )
}
