import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign, getEstablishmentStock, getEstablishments } from '@/lib/data'
import { SaleForm } from './sale-form'

export const metadata = { title: 'Registrar venta' }

export default async function SalePage({
  searchParams,
}: {
  searchParams: Promise<{ establecimiento?: string }>
}) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  // La RLS ya limita los establecimientos que puede ver este usuario.
  const [establishments, stock] = await Promise.all([
    getEstablishments(),
    getEstablishmentStock(campaign.id),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registrar venta"
        description="Apunta los décimos que se han vendido en un establecimiento."
      />
      <SaleForm
        establishments={establishments.filter((e) => e.is_active)}
        stock={stock}
        salePriceCents={campaign.sale_price_cents}
        purchasePriceCents={campaign.purchase_price_cents}
        defaultEstablishmentId={params.establecimiento}
      />
    </div>
  )
}
