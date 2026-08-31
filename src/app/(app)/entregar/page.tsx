import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { requireAdmin } from '@/lib/auth'
import {
  getActiveCampaign,
  getCentralStock,
  getEstablishmentStock,
  getEstablishments,
} from '@/lib/data'
import { DeliveryForm } from './delivery-form'

export const metadata = { title: 'Entregar lotería' }

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ establecimiento?: string; modo?: string }>
}) {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  const [establishments, centralStock, establishmentStock] = await Promise.all([
    getEstablishments(),
    getCentralStock(campaign.id),
    getEstablishmentStock(campaign.id),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Entregar lotería"
        description="Lleva décimos del almacén a un establecimiento, o recógelos de vuelta."
      />
      <DeliveryForm
        establishments={establishments.filter((e) => e.is_active)}
        centralStock={centralStock}
        establishmentStock={establishmentStock}
        defaultEstablishmentId={params.establecimiento}
        defaultMode={params.modo === 'devolver' ? 'return' : 'deliver'}
      />
    </div>
  )
}
