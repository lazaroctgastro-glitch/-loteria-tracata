import Link from 'next/link'
import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import {
  getActiveCampaign,
  getCampaignSummary,
  getEstablishmentCards,
  getMovements,
} from '@/lib/data'
import { formatDate, formatMoney } from '@/lib/money'
import { OpeningBalancesForm } from './form'

export const metadata = { title: 'Saldos iniciales' }

export default async function OpeningBalancesPage() {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [cards, summary, existing] = await Promise.all([
    getEstablishmentCards(campaign.id),
    getCampaignSummary(campaign.id),
    getMovements({ campaignId: campaign.id, type: 'opening_balance', limit: 50 }),
  ])
  const active = existing.filter((m) => !m.reversed_by_movement_id && !m.reverses_movement_id)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Poner las cifras al día"
        description="Dinos cuánto debes y cuánto tienes de verdad, y la aplicación se ajusta."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Para qué sirve esto</CardTitle>
          <CardDescription>
            Escribe los importes <strong>reales</strong>, los que tienes ahora mismo: no la
            diferencia. La aplicación mira lo que le consta, calcula el ajuste que falta y lo apunta
            en el histórico con su fecha, para que quede claro de dónde sale. Solo hay que hacerlo
            una vez, al principio.
          </CardDescription>
        </CardHeader>
      </Card>

      {active.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-3 p-5">
            <p className="font-semibold">Las cifras ya se pusieron al día una vez.</p>
            <ul className="space-y-1 text-sm">
              {active.map((movement) => (
                <li key={movement.id} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {movement.concept}
                    {movement.establishment_name ? ` · ${movement.establishment_name}` : ''}
                  </span>
                  <span className="tabular font-medium">
                    {formatMoney(movement.amount_cents)} · {formatDate(movement.occurred_on)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Si te equivocaste, anúlalos desde Movimientos y vuelve a esta pantalla.
            </p>
            <Button asChild variant="outline">
              <Link href="/movimientos?tipo=opening_balance">Ver y anular en Movimientos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <OpeningBalancesForm
          campaignId={campaign.id}
          cards={cards}
          currentDebtCents={Number(summary?.supplier_debt_cents ?? 0)}
          currentCashCents={Number(summary?.central_cash_cents ?? 0)}
        />
      )}
    </div>
  )
}
