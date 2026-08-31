import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { DataRow, PageHeader } from '@/components/stat'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getActiveCampaign, getCampaigns, getIntegrityCheck } from '@/lib/data'
import { formatMoney, formatNumber } from '@/lib/money'
import { CampaignEditor } from './campaign-editor'

export const metadata = { title: 'Configuración' }

export default async function SettingsPage() {
  await requireAdmin()
  const [campaigns, active] = await Promise.all([getCampaigns(), getActiveCampaign()])
  const integrity = active ? await getIntegrityCheck(active.id) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Precios de la campaña y comprobación de que todo cuadra."
      >
        <CampaignEditor mode="create" />
      </PageHeader>

      {/* ------------------------------------ Control de integridad */}
      <Card className={integrity?.balanced ? 'border-success/40' : 'border-destructive/50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {integrity?.balanced ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <TriangleAlert className="size-5 text-destructive" />
            )}
            Control de integridad
          </CardTitle>
          <CardDescription>
            Comprobación automática de que ningún décimo ni ningún euro se ha perdido por el camino.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integrity ? (
            <p className="text-sm text-muted-foreground">Todavía no hay datos que comprobar.</p>
          ) : integrity.balanced ? (
            <div className="space-y-3">
              <p className="font-medium text-success">Todo cuadra correctamente.</p>
              <div>
                <DataRow label="Décimos comprados" value={formatNumber(integrity.purchased_qty)} strong />
                <DataRow label="En el almacén central" value={formatNumber(integrity.central_qty)} />
                <DataRow
                  label="En los establecimientos"
                  value={formatNumber(integrity.establishment_qty)}
                />
                <DataRow label="Vendidos" value={formatNumber(integrity.sold_qty)} />
                {integrity.written_off_qty !== 0 ? (
                  <DataRow label="Bajas y ajustes" value={formatNumber(integrity.written_off_qty)} />
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(integrity.purchased_qty)} comprados ={' '}
                {formatNumber(integrity.central_qty)} en almacén +{' '}
                {formatNumber(integrity.establishment_qty)} en bares +{' '}
                {formatNumber(integrity.sold_qty)} vendidos
                {integrity.written_off_qty !== 0
                  ? ` + ${formatNumber(integrity.written_off_qty)} de bajas`
                  : ''}
                .
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold text-destructive">Se ha detectado un descuadre.</p>
              {integrity.inventory_difference_qty !== 0 ? (
                <p className="text-sm">
                  Diferencia de inventario: {formatNumber(integrity.inventory_difference_qty)} décimos.
                </p>
              ) : null}
              {integrity.money_difference_cents !== 0 ? (
                <p className="text-sm">
                  Diferencia de dinero: {formatMoney(integrity.money_difference_cents)}.
                </p>
              ) : null}
              {integrity.negative_central_numbers > 0 ? (
                <p className="text-sm">
                  Hay {integrity.negative_central_numbers} números con stock negativo en el almacén.
                </p>
              ) : null}
              {integrity.negative_establishment_stocks > 0 ? (
                <p className="text-sm">
                  Hay {integrity.negative_establishment_stocks} establecimientos con stock negativo.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ Campañas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Campañas
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">Año {campaign.year}</p>
                  </div>
                  {campaign.is_default ? <Badge>En uso</Badge> : null}
                </div>
                <div>
                  <DataRow
                    label="Precio de compra"
                    value={formatMoney(campaign.purchase_price_cents)}
                  />
                  <DataRow label="Precio de venta" value={formatMoney(campaign.sale_price_cents)} />
                  <DataRow
                    label="Para el Fondo Fiesta"
                    value={formatMoney(campaign.sale_price_cents - campaign.purchase_price_cents)}
                    tone="success"
                    strong
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Lo que va a la fiesta se calcula siempre restando el precio de compra al de venta.
                </p>
                <CampaignEditor mode="edit" campaign={campaign} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo funcionan las cuentas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Nada se guarda como un saldo suelto: cada cifra se calcula sumando todos los movimientos
            registrados. Por eso los números no se pueden descuadrar por accidente.
          </p>
          <p>
            Un movimiento nunca se borra. Si te equivocas, se anula creando el movimiento contrario,
            y en el histórico quedan los dos.
          </p>
          <p>
            El dinero se guarda internamente en céntimos enteros, así que no se pierde ni un céntimo
            por redondeos.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
