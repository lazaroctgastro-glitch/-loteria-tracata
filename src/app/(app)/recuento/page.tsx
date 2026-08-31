import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign, getEstablishmentStock, getEstablishments } from '@/lib/data'
import { CountForm } from './count-form'

export const metadata = { title: 'Recuento de lotería' }

export default async function CountPage({
  searchParams,
}: {
  searchParams: Promise<{ establecimiento?: string }>
}) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  const [establishments, stock] = await Promise.all([
    getEstablishments(),
    getEstablishmentStock(campaign.id),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recuento de lotería"
        description="Cuenta los décimos que quedan físicamente y la aplicación calculará lo que se ha vendido."
      />
      <CountForm
        campaignId={campaign.id}
        establishments={establishments.filter((e) => e.is_active)}
        stock={stock}
        salePriceCents={campaign.sale_price_cents}
        commissionCents={campaign.sale_price_cents - campaign.purchase_price_cents}
        defaultEstablishmentId={params.establecimiento}
      />
    </div>
  )
}
