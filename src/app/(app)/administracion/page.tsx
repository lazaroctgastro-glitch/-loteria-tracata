import { NoCampaign } from '@/components/no-campaign'
import { DataRow, EmptyState, PageHeader, Stat } from '@/components/stat'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import {
  getActiveCampaign,
  getCampaignSummary,
  getCentralStock,
  getSupplierAccount,
} from '@/lib/data'
import { formatDate, formatMoney } from '@/lib/money'
import { PaySupplierForm, ReturnToSupplierForm } from './forms'

export const metadata = { title: 'Administración' }

export default async function SupplierPage() {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, account, stock] = await Promise.all([
    getCampaignSummary(campaign.id),
    getSupplierAccount(campaign.id),
    getCentralStock(campaign.id),
  ])

  const debt = Number(summary?.supplier_debt_cents ?? 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administración de lotería"
        description="Lo que has retirado, lo que has pagado y lo que queda a deber."
      />

      <Card className={debt > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-success/40 bg-success/5'}>
        <CardContent className="p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {debt > 0 ? 'Debes a la administración' : debt < 0 ? 'Tienes saldo a favor' : 'No debes nada'}
          </p>
          <p
            className={`tabular mt-1 text-4xl font-bold ${
              debt > 0 ? 'text-destructive' : 'text-success'
            }`}
          >
            {formatMoney(Math.abs(debt))}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Has retirado {formatMoney(summary?.purchases_cost_cents ?? 0)} en lotería y has pagado{' '}
            {formatMoney(summary?.supplier_paid_cents ?? 0)}.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Lotería retirada"
          value={formatMoney(summary?.purchases_cost_cents ?? 0)}
          size="sm"
          hint="A precio de coste"
        />
        <Stat
          label="Pagado"
          value={formatMoney(summary?.supplier_paid_cents ?? 0)}
          size="sm"
          tone="success"
        />
        <Stat
          label="Pendiente de pago"
          value={formatMoney(debt)}
          size="sm"
          tone={debt > 0 ? 'destructive' : 'success'}
        />
        <Stat
          label="Tienes en caja"
          value={formatMoney(summary?.central_cash_cents ?? 0)}
          size="sm"
          hint="Para poder pagar"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PaySupplierForm
          campaignId={campaign.id}
          debtCents={debt}
          cashCents={Number(summary?.central_cash_cents ?? 0)}
        />
        <ReturnToSupplierForm
          stock={stock.filter((row) => row.qty > 0)}
          purchasePriceCents={campaign.purchase_price_cents}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuenta corriente</CardTitle>
          <CardDescription>
            Cada retirada suma a lo que debes y cada pago lo resta. El saldo es lo que queda
            pendiente en ese momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {account.length === 0 ? (
            <EmptyState
              title="Todavía no hay movimientos con la administración."
              description="Aparecerán aquí en cuanto retires lotería o hagas un pago."
            />
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Concepto</th>
                  <th className="py-2 text-right font-medium">Retirada</th>
                  <th className="py-2 text-right font-medium">Pago</th>
                  <th className="py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {account.map((row) => (
                  <tr key={row.id} className={row.is_reversed ? 'text-muted-foreground line-through' : ''}>
                    <td className="tabular whitespace-nowrap py-2">{formatDate(row.occurred_on)}</td>
                    <td className="py-2">
                      {row.concept}
                      {row.lottery_number ? (
                        <span className="tabular text-muted-foreground"> · nº {row.lottery_number}</span>
                      ) : null}
                      {row.is_reversed ? (
                        <Badge variant="destructive" className="ml-2">
                          Anulado
                        </Badge>
                      ) : null}
                    </td>
                    <td className="tabular py-2 text-right">
                      {Number(row.charge_cents) > 0 ? formatMoney(row.charge_cents) : '—'}
                    </td>
                    <td className="tabular py-2 text-right text-success">
                      {Number(row.payment_cents) > 0 ? `− ${formatMoney(row.payment_cents)}` : '—'}
                    </td>
                    <td className="tabular py-2 text-right font-semibold">
                      {formatMoney(row.balance_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo se calcula lo que debes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataRow
            label="Valor de la lotería retirada"
            value={formatMoney(summary?.purchases_cost_cents ?? 0)}
          />
          <DataRow
            label="Pagos realizados"
            value={`− ${formatMoney(summary?.supplier_paid_cents ?? 0)}`}
          />
          <div className="mt-2 border-t pt-2">
            <DataRow
              label="Pendiente de pago"
              value={formatMoney(debt)}
              strong
              tone={debt > 0 ? 'destructive' : 'success'}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Las devoluciones de décimos a la administración también restan de lo que debes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
