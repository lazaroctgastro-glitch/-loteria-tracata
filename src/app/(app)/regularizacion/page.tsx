import Link from 'next/link'
import { NoCampaign } from '@/components/no-campaign'
import { PageHeader } from '@/components/stat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getEstablishments, getMovements } from '@/lib/data'
import { formatDate, formatMoney } from '@/lib/money'
import { OpeningBalancesForm } from './form'

export const metadata = { title: 'Saldos iniciales' }

export default async function OpeningBalancesPage() {
  const user = await requireAdmin()
  const campaign = await getActiveCampaign()
  if (!campaign) return <NoCampaign isAdmin={user.isAdmin} />

  const [establishments, existing] = await Promise.all([
    getEstablishments(),
    getMovements({ campaignId: campaign.id, type: 'opening_balance', limit: 50 }),
  ])
  const active = existing.filter((m) => !m.reversed_by_movement_id && !m.reverses_movement_id)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Saldos iniciales"
        description="Para arrancar con la situación real si ya venías llevando las cuentas en papel."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Para qué sirve esto</CardTitle>
          <CardDescription>
            La aplicación calcula todo sumando movimientos. Si cuando empiezas ya debías dinero a la
            administración, ya tenías efectivo guardado, o algún bar ya tenía dinero tuyo, apúntalo
            aquí una vez y a partir de ahí las cifras serán las de verdad. Queda registrado como un
            movimiento más, con su fecha, para no perder la trazabilidad.
          </CardDescription>
        </CardHeader>
      </Card>

      {active.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-3 p-5">
            <p className="font-semibold">Los saldos iniciales ya están registrados.</p>
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
        <OpeningBalancesForm campaignId={campaign.id} establishments={establishments} />
      )}
    </div>
  )
}
