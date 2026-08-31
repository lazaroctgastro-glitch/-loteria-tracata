import { NoCampaign } from '@/components/no-campaign'
import { PageHeader, Stat } from '@/components/stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getCampaignSummary, getMovements } from '@/lib/data'
import { formatDate, formatMoney, formatNumber } from '@/lib/money'
import { PurchaseForm } from './purchase-form'

export const metadata = { title: 'Comprar lotería' }

export default async function PurchasePage() {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, purchases] = await Promise.all([
    getCampaignSummary(campaign.id),
    getMovements({ campaignId: campaign.id, type: 'purchase', limit: 25 }),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comprar lotería"
        description="Registra los décimos que compras en la administración."
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Caja central disponible"
          value={formatMoney(summary?.central_cash_cents ?? 0)}
          tone={Number(summary?.central_cash_cents ?? 0) < 0 ? 'destructive' : 'default'}
          hint="Dinero con el que puedes comprar"
        />
        <Stat
          label="Décimos comprados"
          value={formatNumber(summary?.purchased_qty ?? 0)}
          hint={`${formatMoney(summary?.purchases_cost_cents ?? 0)} invertidos`}
        />
      </div>

      <PurchaseForm
        campaignId={campaign.id}
        defaultPriceCents={campaign.purchase_price_cents}
        salePriceCents={campaign.sale_price_cents}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compras anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no has comprado lotería.</p>
          ) : (
            <ul className="divide-y">
              {purchases.map((purchase) => (
                <li key={purchase.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="tabular font-semibold">
                      Número {purchase.lottery_number}
                      {purchase.reverses_movement_id ? ' · ANULACIÓN' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(purchase.occurred_on)}
                      {purchase.supplier ? ` · ${purchase.supplier}` : ''}
                      {purchase.reversed_by_movement_id ? ' · Anulada' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">
                      {formatNumber(purchase.d_purchased_qty)} décimos
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      {formatMoney(Math.abs(purchase.amount_cents))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
