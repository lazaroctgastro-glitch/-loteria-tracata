import { DataRow, PageHeader, Stat } from '@/components/stat'
import { NoCampaign } from '@/components/no-campaign'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getCampaignSummary, getMovements } from '@/lib/data'
import { formatDate, formatMoney } from '@/lib/money'
import { MOVEMENT_LABELS } from '@/lib/database.types'
import { InjectionForm } from './injection-form'

export const metadata = { title: 'Caja central' }

const CASH_TYPES = ['purchase', 'withdrawal', 'capital_injection', 'fund_expense'] as const

export default async function CentralCashPage() {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [summary, movements] = await Promise.all([
    getCampaignSummary(campaign.id),
    getMovements({ campaignId: campaign.id, limit: 500 }),
  ])

  const cashMovements = movements.filter(
    (m) => m.d_central_cash_cents !== 0 && CASH_TYPES.includes(m.type as (typeof CASH_TYPES)[number]),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja central"
        description="El dinero del proyecto: lo que entra de los bares y lo que sale para comprar lotería."
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dinero disponible ahora mismo
          </p>
          <p className="tabular mt-1 text-4xl font-bold">
            {formatMoney(summary?.central_cash_cents ?? 0)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Quedan {formatMoney(summary?.pending_in_establishments_cents ?? 0)} por recoger en los
            establecimientos.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Aportado por ti" value={formatMoney(summary?.injected_cents ?? 0)} />
        <Stat label="Recogido de los bares" value={formatMoney(summary?.withdrawn_cents ?? 0)} tone="success" />
        <Stat label="Gastado en lotería" value={formatMoney(summary?.purchases_cost_cents ?? 0)} />
        <Stat label="Gastos del Fondo Fiesta" value={formatMoney(summary?.fund_expenses_cents ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">De dónde sale el dinero</CardTitle>
            <CardDescription>
              Aunque el dinero esté junto, así se reparte contablemente.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <div className="pb-2">
              <DataRow label="Aportaciones tuyas" value={formatMoney(summary?.injected_cents ?? 0)} />
              <DataRow
                label="Recogido de los establecimientos"
                value={formatMoney(summary?.withdrawn_cents ?? 0)}
              />
            </div>
            <div className="py-2">
              <DataRow
                label="Compras de lotería"
                value={`− ${formatMoney(summary?.purchases_cost_cents ?? 0)}`}
              />
              <DataRow
                label="Gastos del Fondo Fiesta"
                value={`− ${formatMoney(summary?.fund_expenses_cents ?? 0)}`}
              />
            </div>
            <div className="pt-2">
              <DataRow
                label="Disponible en caja central"
                value={formatMoney(summary?.central_cash_cents ?? 0)}
                strong
                tone={Number(summary?.central_cash_cents ?? 0) < 0 ? 'destructive' : 'success'}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">De lo vendido, ¿qué es qué?</CardTitle>
            <CardDescription>
              Cada décimo de {formatMoney(campaign.sale_price_cents)} recupera{' '}
              {formatMoney(campaign.purchase_price_cents)} de su coste y deja{' '}
              {formatMoney(campaign.sale_price_cents - campaign.purchase_price_cents)} para la fiesta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataRow label="Han vendido en total" value={formatMoney(summary?.revenue_cents ?? 0)} strong />
            <DataRow
              label="Capital recuperado"
              value={formatMoney(summary?.capital_recovered_cents ?? 0)}
            />
            <DataRow
              label="Para el Fondo Fiesta"
              value={formatMoney(summary?.commission_cents ?? 0)}
              tone="success"
            />
            <div className="mt-3 border-t pt-3">
              <DataRow
                label="Todavía en los bares"
                value={formatMoney(summary?.pending_in_establishments_cents ?? 0)}
                tone="warning"
              />
              <DataRow label="Ya recogido" value={formatMoney(summary?.withdrawn_cents ?? 0)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <InjectionForm campaignId={campaign.id} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos de la caja central</CardTitle>
        </CardHeader>
        <CardContent>
          {cashMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay movimientos de dinero.</p>
          ) : (
            <ul className="divide-y">
              {cashMovements.map((movement) => (
                <li key={movement.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {movement.concept ?? MOVEMENT_LABELS[movement.type]}
                      {movement.establishment_name ? ` · ${movement.establishment_name}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(movement.occurred_on)} · {MOVEMENT_LABELS[movement.type]}
                    </p>
                  </div>
                  <span
                    className={`tabular shrink-0 font-semibold ${
                      movement.d_central_cash_cents > 0 ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {movement.d_central_cash_cents > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(movement.d_central_cash_cents))}
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
