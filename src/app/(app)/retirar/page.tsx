import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getEstablishmentCards, getMovements } from '@/lib/data'
import { WithdrawForm } from './withdraw-form'

export const metadata = { title: 'Retirar dinero' }

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<{ establecimiento?: string }>
}) {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  const cards = await getEstablishmentCards(campaign.id)

  // Ventas realizadas después de la última retirada de cada establecimiento.
  const movements = await getMovements({ campaignId: campaign.id, limit: 1000 })
  const salesSinceWithdrawal = Object.fromEntries(
    cards.map((card) => {
      const lastWithdrawal = movements
        .filter((m) => m.establishment_id === card.establishment_id && m.type === 'withdrawal')
        .map((m) => m.created_at)
        .sort()
        .at(-1)
      const sold = movements
        .filter(
          (m) =>
            m.establishment_id === card.establishment_id &&
            m.d_sold_qty !== 0 &&
            (!lastWithdrawal || m.created_at > lastWithdrawal),
        )
        .reduce((acc, m) => acc + m.d_sold_qty, 0)
      return [card.establishment_id, sold]
    }),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Retirar dinero"
        description="Recoge el dinero de la caja de lotería de un establecimiento."
      />
      <WithdrawForm
        campaignId={campaign.id}
        cards={cards.filter((card) => card.is_active || card.pending_cents !== 0)}
        salesSinceWithdrawal={salesSinceWithdrawal}
        defaultEstablishmentId={params.establecimiento}
      />
    </div>
  )
}
