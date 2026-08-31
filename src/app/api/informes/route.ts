import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import {
  getActiveCampaign,
  getCampaignSummary,
  getEstablishmentCards,
  getFundByEstablishment,
  getMovements,
  getNumberSummary,
} from '@/lib/data'
import { MOVEMENT_LABELS, type MovementType } from '@/lib/database.types'
import { centsToCsv, csvResponse, toCsv } from '@/lib/csv'

/** Informes que contienen cifras globales del proyecto. */
const ADMIN_ONLY_REPORTS = ['caja', 'fondo', 'numeros']

/** Exportación de informes a CSV. Respeta los permisos del usuario (RLS). */
export async function GET(request: NextRequest) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()
  if (!campaign) return NextResponse.json({ error: 'No hay campaña' }, { status: 404 })

  const params = request.nextUrl.searchParams
  const report = params.get('informe') ?? 'movimientos'
  const stamp = new Date().toISOString().slice(0, 10)

  // Estos informes presentan totales del proyecto. Para un responsable la RLS
  // solo dejaría pasar sus propias cifras, que quedarían rotuladas como si
  // fuesen el total: mejor no ofrecerlos que darlos mal.
  if (ADMIN_ONLY_REPORTS.includes(report) && !user.isAdmin) {
    return NextResponse.json(
      { error: 'Este informe solo está disponible para el administrador.' },
      { status: 403 },
    )
  }

  switch (report) {
    case 'establecimientos': {
      const cards = await getEstablishmentCards(campaign.id)
      return csvResponse(
        `establecimientos-${stamp}.csv`,
        toCsv(
          [
            'Establecimiento',
            'Entregados',
            'Devueltos',
            'Vendidos',
            'Stock actual',
            'Ventas (€)',
            'Capital recuperado (€)',
            'Fondo Fiesta (€)',
            'Retirado (€)',
            'Pendiente de recoger (€)',
          ],
          cards.map((card) => [
            card.establishment_name,
            card.delivered_qty,
            card.returned_qty,
            card.sold_qty,
            card.stock_qty,
            centsToCsv(card.revenue_cents),
            centsToCsv(card.capital_cents),
            centsToCsv(card.commission_cents),
            centsToCsv(card.withdrawn_cents),
            centsToCsv(card.pending_cents),
          ]),
        ),
      )
    }

    case 'numeros': {
      const numbers = await getNumberSummary(campaign.id)
      return csvResponse(
        `numeros-${stamp}.csv`,
        toCsv(
          [
            'Número',
            'Comprados',
            'En almacén',
            'En establecimientos',
            'Vendidos',
            'Coste (€)',
            'Ventas (€)',
            'Fondo Fiesta (€)',
          ],
          numbers.map((row) => [
            row.number,
            row.purchased_qty,
            row.central_qty,
            row.distributed_qty,
            row.sold_qty,
            centsToCsv(row.purchase_cost_cents),
            centsToCsv(row.revenue_cents),
            centsToCsv(row.commission_cents),
          ]),
        ),
      )
    }

    case 'caja': {
      const summary = await getCampaignSummary(campaign.id)
      const rows: Array<[string, string]> = summary
        ? [
            ['Décimos comprados', String(summary.purchased_qty)],
            ['Décimos vendidos', String(summary.sold_qty)],
            ['Décimos en stock', String(summary.total_stock_qty)],
            ['Facturación (€)', centsToCsv(summary.revenue_cents)],
            ['Capital recuperado (€)', centsToCsv(summary.capital_recovered_cents)],
            ['Fondo Fiesta generado (€)', centsToCsv(summary.commission_cents)],
            ['Pendiente en establecimientos (€)', centsToCsv(summary.pending_in_establishments_cents)],
            ['Dinero retirado (€)', centsToCsv(summary.withdrawn_cents)],
            ['Aportaciones (€)', centsToCsv(summary.injected_cents)],
            ['Compras de lotería (€)', centsToCsv(summary.purchases_cost_cents)],
            ['Gastos del Fondo Fiesta (€)', centsToCsv(summary.fund_expenses_cents)],
            ['Caja central disponible (€)', centsToCsv(summary.central_cash_cents)],
          ]
        : []
      return csvResponse(`caja-${stamp}.csv`, toCsv(['Concepto', 'Valor'], rows))
    }

    case 'fondo': {
      const [fund, summary] = await Promise.all([
        getFundByEstablishment(campaign.id),
        getCampaignSummary(campaign.id),
      ])
      const total = Number(summary?.commission_cents ?? 0)
      return csvResponse(
        `fondo-fiesta-${stamp}.csv`,
        toCsv(
          ['Establecimiento', 'Décimos vendidos', 'Aportado (€)', '% del fondo'],
          fund.map((row) => [
            row.establishment_name,
            row.sold_qty,
            centsToCsv(row.commission_cents),
            total > 0 ? ((Number(row.commission_cents) / total) * 100).toFixed(1) : '0,0',
          ]),
        ),
      )
    }

    default: {
      const movements = await getMovements({
        campaignId: campaign.id,
        establishmentId: params.get('establecimiento') || undefined,
        lotteryNumberId: params.get('numero') || undefined,
        type: (params.get('tipo') as MovementType) || undefined,
        from: params.get('desde') || undefined,
        to: params.get('hasta') || undefined,
        limit: 5000,
      })
      return csvResponse(
        `movimientos-${stamp}.csv`,
        toCsv(
          [
            'Fecha',
            'Registrado',
            'Usuario',
            'Tipo',
            'Establecimiento',
            'Número',
            'Cantidad',
            'Importe (€)',
            'Décimos vendidos',
            'Fondo Fiesta (€)',
            'Caja del bar (€)',
            'Caja central (€)',
            'Concepto',
            'Observaciones',
            'Anulado',
          ],
          movements.map((movement) => [
            movement.occurred_on,
            movement.created_at,
            movement.created_by_name ?? movement.created_by_email ?? '',
            MOVEMENT_LABELS[movement.type],
            movement.establishment_name ?? '',
            movement.lottery_number ?? '',
            movement.quantity,
            centsToCsv(movement.amount_cents),
            movement.d_sold_qty,
            centsToCsv(movement.d_commission_cents),
            centsToCsv(movement.d_pending_cents),
            centsToCsv(movement.d_central_cash_cents),
            movement.concept ?? '',
            movement.notes ?? '',
            movement.reversed_by_movement_id ? 'Sí' : 'No',
          ]),
        ),
      )
    }
  }
}
