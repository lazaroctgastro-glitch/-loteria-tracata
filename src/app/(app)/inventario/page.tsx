import { NoCampaign } from '@/components/no-campaign'
import { EmptyState, PageHeader, Stat } from '@/components/stat'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import {
  getActiveCampaign,
  getCampaignSummary,
  getCentralStock,
  getEstablishmentStock,
  getNumberSummary,
} from '@/lib/data'
import { formatNumber } from '@/lib/money'

export const metadata = { title: 'Inventario' }

export default async function InventoryPage() {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, central, byEstablishment, numbers] = await Promise.all([
    getCampaignSummary(campaign.id),
    getCentralStock(campaign.id),
    getEstablishmentStock(campaign.id),
    getNumberSummary(campaign.id),
  ])

  const grouped = byEstablishment.reduce<Record<string, typeof byEstablishment>>((acc, row) => {
    ;(acc[row.establishment_name] ??= []).push(row)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <PageHeader title="Inventario" description="Dónde está cada décimo en este momento." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {user.isAdmin ? (
          <Stat label="Comprados" value={formatNumber(summary?.purchased_qty ?? 0)} />
        ) : null}
        {user.isAdmin ? (
          <Stat label="En el almacén" value={formatNumber(summary?.central_stock_qty ?? 0)} />
        ) : null}
        <Stat
          label="En los establecimientos"
          value={formatNumber(summary?.establishment_stock_qty ?? 0)}
        />
        <Stat label="Vendidos" value={formatNumber(summary?.sold_qty ?? 0)} tone="primary" />
      </div>

      {user.isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock central</CardTitle>
          </CardHeader>
          <CardContent>
            {central.length === 0 ? (
              <EmptyState title="Todavía no has comprado ningún número." />
            ) : (
              <ul className="divide-y">
                {central.map((row) => (
                  <li key={row.lottery_number_id} className="flex items-center justify-between py-3">
                    <span className="tabular text-lg font-semibold">{row.number}</span>
                    <span className="tabular font-medium">
                      {formatNumber(row.qty)} décimos
                      {row.qty === 0 ? <Badge variant="secondary" className="ml-2">Agotado</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock por establecimiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.keys(grouped).length === 0 ? (
            <EmptyState title="No hay décimos repartidos en los establecimientos." />
          ) : (
            Object.entries(grouped).map(([name, rows]) => (
              <div key={name}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">{name}</h3>
                  <span className="tabular text-sm text-muted-foreground">
                    {formatNumber(rows.reduce((acc, row) => acc + row.qty, 0))} décimos
                  </span>
                </div>
                <ul className="mt-1 divide-y border-t">
                  {rows.map((row) => (
                    <li key={row.lottery_number_id} className="flex justify-between py-2 text-sm">
                      <span className="tabular">{row.number}</span>
                      <span className="tabular font-medium">{formatNumber(row.qty)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {user.isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen por número</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Número</th>
                  <th className="py-2 text-right font-medium">Comprados</th>
                  <th className="py-2 text-right font-medium">En almacén</th>
                  <th className="py-2 text-right font-medium">En bares</th>
                  <th className="py-2 text-right font-medium">Vendidos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {numbers.map((row) => (
                  <tr key={row.lottery_number_id} className="tabular">
                    <td className="py-2 font-semibold">{row.number}</td>
                    <td className="py-2 text-right">{formatNumber(row.purchased_qty)}</td>
                    <td className="py-2 text-right">{formatNumber(row.central_qty)}</td>
                    <td className="py-2 text-right">{formatNumber(row.distributed_qty)}</td>
                    <td className="py-2 text-right font-medium">{formatNumber(row.sold_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
