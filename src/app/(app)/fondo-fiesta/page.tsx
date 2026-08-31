import { NoCampaign } from '@/components/no-campaign'
import { EmptyState, PageHeader, Stat } from '@/components/stat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign, getCampaignSummary, getFundByEstablishment, getMovements } from '@/lib/data'
import { formatDate, formatMoney, formatNumber } from '@/lib/money'
import { ExpenseForm } from './expense-form'

export const metadata = { title: 'Fondo Fiesta' }

export default async function FundPage() {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, byEstablishment, expenses] = await Promise.all([
    getCampaignSummary(campaign.id),
    getFundByEstablishment(campaign.id),
    getMovements({ campaignId: campaign.id, type: 'fund_expense', limit: 50 }),
  ])

  const generated = Number(summary?.commission_cents ?? 0)
  const commissionPerTicket = campaign.sale_price_cents - campaign.purchase_price_cents

  // Un responsable solo ve los movimientos de su establecimiento, así que estas
  // cifras son SU aportación, no el fondo entero. Se rotulan como tales para no
  // enseñarle un total que no lo es.
  if (!user.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Fondo Fiesta"
          description={`Cada décimo vendido aporta ${formatMoney(commissionPerTicket)} a la fiesta del personal.`}
        />

        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lo que has aportado a la fiesta
            </p>
            <p className="tabular mt-1 text-4xl font-bold text-success">{formatMoney(generated)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Con {formatNumber(summary?.sold_qty ?? 0)} décimos vendidos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tu aportación</CardTitle>
            <CardDescription>
              El total del fondo y los gastos los lleva el administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byEstablishment.length === 0 ? (
              <EmptyState title="Todavía no has vendido ningún décimo." />
            ) : (
              <ul className="divide-y">
                {byEstablishment.map((row) => (
                  <li key={row.establishment_id} className="flex justify-between py-2">
                    <span className="font-medium">{row.establishment_name}</span>
                    <span className="tabular font-semibold text-success">
                      {formatNumber(row.sold_qty)} décimos · {formatMoney(row.commission_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fondo Fiesta"
        description={`Cada décimo vendido aporta ${formatMoney(commissionPerTicket)} a la fiesta del personal.`}
      />

      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fondo Fiesta acumulado
          </p>
          <p className="tabular mt-1 text-4xl font-bold text-success">
            {formatMoney(summary?.fund_balance_cents ?? 0)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Generado {formatMoney(generated)} con {formatNumber(summary?.sold_qty ?? 0)} décimos
            vendidos
            {Number(summary?.fund_expenses_cents ?? 0) > 0
              ? `, menos ${formatMoney(summary?.fund_expenses_cents ?? 0)} ya gastados`
              : ''}
            .
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Generado" value={formatMoney(generated)} tone="success" size="sm" />
        <Stat label="Gastado" value={formatMoney(summary?.fund_expenses_cents ?? 0)} size="sm" />
        <Stat label="Saldo" value={formatMoney(summary?.fund_balance_cents ?? 0)} size="sm" tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuánto ha aportado cada establecimiento</CardTitle>
        </CardHeader>
        <CardContent>
          {byEstablishment.length === 0 ? (
            <EmptyState title="Todavía no se ha vendido ningún décimo." />
          ) : (
            <ul className="space-y-4">
              {byEstablishment.map((row) => {
                const share = generated > 0 ? (Number(row.commission_cents) / generated) * 100 : 0
                return (
                  <li key={row.establishment_id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{row.establishment_name}</span>
                      <span className="tabular font-semibold text-success">
                        {formatMoney(row.commission_cents)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(row.sold_qty)} décimos · {share.toFixed(1)}% del fondo
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ExpenseForm campaignId={campaign.id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gastos de la fiesta</CardTitle>
          <CardDescription>Lo que se ha pagado con el dinero del fondo.</CardDescription>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se ha gastado nada del fondo.</p>
          ) : (
            <ul className="divide-y">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{expense.concept}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(expense.occurred_on)}
                      {expense.reversed_by_movement_id ? ' · Anulado' : ''}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-semibold">
                    {formatMoney(Math.abs(expense.amount_cents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
