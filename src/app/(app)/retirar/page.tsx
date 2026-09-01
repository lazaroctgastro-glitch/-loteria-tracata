import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getEstablishmentCards, getSalesSinceLastWithdrawal } from '@/lib/data'
import { AdjustCashDialog } from './adjust-cash'
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
  const [cards, salesSince] = await Promise.all([
    getEstablishmentCards(campaign.id),
    getSalesSinceLastWithdrawal(campaign.id),
  ])

  // Décimos vendidos después de la última retirada de cada establecimiento.
  const salesSinceWithdrawal = Object.fromEntries(
    salesSince.map((row) => [row.establishment_id, Number(row.sold_qty)]),
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

      <AdjustCashDialog
        campaignId={campaign.id}
        cards={cards.filter((card) => card.is_active || card.pending_cents !== 0)}
        defaultEstablishmentId={params.establecimiento}
      />
    </div>
  )
}
