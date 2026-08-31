import { NoCampaign } from '@/components/no-campaign'
import { DataRow, EmptyState, PageHeader } from '@/components/stat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import {
  getActiveCampaign,
  getCampaignSummary,
  getEstablishmentCards,
  getEstablishments,
  getFundByEstablishment,
  getLotteryNumbers,
  getMovements,
  getNumberSummary,
} from '@/lib/data'
import type { MovementType } from '@/lib/database.types'
import { formatMoney, formatNumber } from '@/lib/money'
import { ReportFilters, ExportButtons, PrintButton } from './report-controls'

export const metadata = { title: 'Informes' }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const params = await searchParams
  const filters = {
    campaignId: campaign.id,
    establishmentId: params.establecimiento || undefined,
    lotteryNumberId: params.numero || undefined,
    type: (params.tipo as MovementType) || undefined,
    from: params.desde || undefined,
    to: params.hasta || undefined,
    limit: 5000,
  }

  const [summary, cards, numbers, fund, establishments, allNumbers, movements] = await Promise.all([
    getCampaignSummary(campaign.id),
    getEstablishmentCards(campaign.id),
    getNumberSummary(campaign.id),
    getFundByEstablishment(campaign.id),
    getEstablishments(),
    getLotteryNumbers(campaign.id),
    getMovements(filters),
  ])

  // El informe general del periodo se calcula sobre los movimientos filtrados.
  const period = movements.reduce(
    (acc, movement) => ({
      purchased: acc.purchased + movement.d_purchased_qty,
      delivered:
        acc.delivered + (movement.type === 'delivery' ? movement.d_establishment_qty : 0),
      sold: acc.sold + movement.d_sold_qty,
      revenue: acc.revenue + movement.d_revenue_cents,
      capital: acc.capital + movement.d_capital_cents,
      commission: acc.commission + movement.d_commission_cents,
      withdrawn: acc.withdrawn + (movement.type === 'withdrawal' ? movement.d_central_cash_cents : 0),
      pending: acc.pending + movement.d_pending_cents,
    }),
    {
      purchased: 0,
      delivered: 0,
      sold: 0,
      revenue: 0,
      capital: 0,
      commission: 0,
      withdrawn: 0,
      pending: 0,
    },
  )

  const filtered = Boolean(
    params.establecimiento || params.numero || params.tipo || params.desde || params.hasta,
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Informes" description="Resúmenes de la campaña, filtrables y exportables.">
        <PrintButton />
      </PageHeader>

      <Card className="print:hidden">
        <CardContent className="space-y-4 pt-5">
          <ReportFilters establishments={establishments} numbers={allNumbers} params={params} />
          <ExportButtons params={params} isAdmin={user.isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered ? 'Informe del periodo filtrado' : 'Informe general'}
          </CardTitle>
          <CardDescription>
            {filtered
              ? `Calculado sobre ${movements.length} movimientos.`
              : 'Situación acumulada de toda la campaña.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <DataRow label="Décimos comprados" value={formatNumber(period.purchased)} />
            <DataRow label="Décimos entregados" value={formatNumber(period.delivered)} />
            <DataRow label="Décimos vendidos" value={formatNumber(period.sold)} strong />
            {!filtered ? (
              <DataRow label="Décimos en stock" value={formatNumber(summary?.total_stock_qty ?? 0)} />
            ) : null}
          </div>
          <div>
            <DataRow label="Facturación" value={formatMoney(period.revenue)} strong />
            <DataRow label="Capital recuperado" value={formatMoney(period.capital)} />
            <DataRow label="Fondo Fiesta" value={formatMoney(period.commission)} tone="success" />
            <DataRow label="Dinero retirado" value={formatMoney(period.withdrawn)} />
            <DataRow
              label={filtered ? 'Variación del pendiente' : 'Pendiente de recoger'}
              value={formatMoney(
                filtered ? period.pending : (summary?.pending_in_establishments_cents ?? 0),
              )}
              tone="warning"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informe por establecimiento</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ReportTable
            headers={['Establecimiento', 'Entregados', 'Vendidos', 'Stock', 'Ventas', 'Fondo', 'Pendiente']}
            rows={cards.map((card) => [
              card.establishment_name,
              formatNumber(card.delivered_qty),
              formatNumber(card.sold_qty),
              formatNumber(card.stock_qty),
              formatMoney(card.revenue_cents),
              formatMoney(card.commission_cents),
              formatMoney(card.pending_cents),
            ])}
          />
        </CardContent>
      </Card>

      {user.isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informe por número de lotería</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ReportTable
              headers={['Número', 'Comprados', 'Almacén', 'En bares', 'Vendidos', 'Coste', 'Ventas']}
              rows={numbers.map((row) => [
                row.number,
                formatNumber(row.purchased_qty),
                formatNumber(row.central_qty),
                formatNumber(row.distributed_qty),
                formatNumber(row.sold_qty),
                formatMoney(row.purchase_cost_cents),
                formatMoney(row.revenue_cents),
              ])}
            />
          </CardContent>
        </Card>
      ) : null}

      {user.isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informe de caja</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <DataRow label="Aportaciones" value={formatMoney(summary?.injected_cents ?? 0)} />
              <DataRow label="Recogido de los bares" value={formatMoney(summary?.withdrawn_cents ?? 0)} />
              <DataRow
                label="Compras de lotería"
                value={`− ${formatMoney(summary?.purchases_cost_cents ?? 0)}`}
              />
              <DataRow
                label="Gastos del fondo"
                value={`− ${formatMoney(summary?.fund_expenses_cents ?? 0)}`}
              />
            </div>
            <div>
              <DataRow
                label="Caja central disponible"
                value={formatMoney(summary?.central_cash_cents ?? 0)}
                strong
              />
              <DataRow
                label="Pendiente en los bares"
                value={formatMoney(summary?.pending_in_establishments_cents ?? 0)}
                tone="warning"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informe del Fondo Fiesta</CardTitle>
        </CardHeader>
        <CardContent>
          {fund.length === 0 ? (
            <EmptyState title="Todavía no se ha generado fondo." />
          ) : (
            <>
              <ReportTable
                headers={['Establecimiento', 'Décimos vendidos', 'Aportado', '% del fondo']}
                rows={fund.map((row) => {
                  const total = Number(summary?.commission_cents ?? 0)
                  return [
                    row.establishment_name,
                    formatNumber(row.sold_qty),
                    formatMoney(row.commission_cents),
                    total > 0 ? `${((Number(row.commission_cents) / total) * 100).toFixed(1)} %` : '—',
                  ]
                })}
              />
              <div className="mt-3 border-t pt-3">
                <DataRow label="Generado" value={formatMoney(summary?.commission_cents ?? 0)} />
                <DataRow
                  label="Gastado"
                  value={`− ${formatMoney(summary?.fund_expenses_cents ?? 0)}`}
                />
                <DataRow
                  label="Saldo del fondo"
                  value={formatMoney(summary?.fund_balance_cents ?? 0)}
                  strong
                  tone="success"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return <EmptyState title="Sin datos." />
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          {headers.map((header, index) => (
            <th key={header} className={index === 0 ? 'py-2 font-medium' : 'py-2 text-right font-medium'}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row[0]} className="tabular">
            {row.map((cell, index) => (
              <td
                key={index}
                className={index === 0 ? 'py-2 font-medium' : 'py-2 text-right'}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
