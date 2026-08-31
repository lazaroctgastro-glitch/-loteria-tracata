/**
 * Tipos de la base de datos. Reflejan las migraciones de `supabase/migrations`.
 * Todos los importes son céntimos enteros.
 */

export type AppRole = 'admin' | 'manager'

export type MovementType =
  | 'purchase'
  | 'capital_injection'
  | 'delivery'
  | 'return'
  | 'sale'
  | 'count'
  | 'adjustment'
  | 'withdrawal'
  | 'fund_expense'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: AppRole
  is_active: boolean
  created_at: string
}

export type Establishment = {
  id: string
  name: string
  manager_name: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export type Campaign = {
  id: string
  name: string
  year: number
  purchase_price_cents: number
  sale_price_cents: number
  is_active: boolean
  is_default: boolean
  created_at: string
}

export type LotteryNumber = {
  id: string
  campaign_id: string
  number: string
  description: string | null
  created_at: string
}

export type Movement = {
  id: string
  campaign_id: string
  type: MovementType
  occurred_on: string
  created_at: string
  created_by: string | null
  created_by_email: string | null
  establishment_id: string | null
  lottery_number_id: string | null
  quantity: number
  unit_price_cents: number | null
  amount_cents: number
  concept: string | null
  notes: string | null
  supplier: string | null
  group_id: string | null
  reverses_movement_id: string | null
  reversed_by_movement_id: string | null
  d_purchased_qty: number
  d_central_qty: number
  d_establishment_qty: number
  d_sold_qty: number
  d_written_off_qty: number
  d_pending_cents: number
  d_central_cash_cents: number
  d_revenue_cents: number
  d_capital_cents: number
  d_commission_cents: number
  d_fund_expense_cents: number
}

export type MovementDetailed = Movement & {
  establishment_name: string | null
  lottery_number: string | null
  created_by_name: string | null
  is_reversed: boolean
  is_reversal: boolean
}

export type CampaignSummary = {
  campaign_id: string
  campaign_name: string
  year: number
  purchase_price_cents: number
  sale_price_cents: number
  commission_price_cents: number
  purchased_qty: number
  sold_qty: number
  central_stock_qty: number
  establishment_stock_qty: number
  total_stock_qty: number
  written_off_qty: number
  revenue_cents: number
  capital_recovered_cents: number
  commission_cents: number
  pending_in_establishments_cents: number
  withdrawn_cents: number
  purchases_cost_cents: number
  injected_cents: number
  fund_expenses_cents: number
  fund_balance_cents: number
  central_cash_cents: number
}

export type EstablishmentDashboard = {
  campaign_id: string
  establishment_id: string
  establishment_name: string
  manager_name: string | null
  is_active: boolean
  sort_order: number
  delivered_qty: number
  returned_qty: number
  sold_qty: number
  stock_qty: number
  adjusted_qty: number
  revenue_cents: number
  capital_cents: number
  commission_cents: number
  pending_cents: number
  withdrawn_cents: number
  last_withdrawal_on: string | null
  last_sale_on: string | null
  last_count_on: string | null
}

export type StockCentralRow = {
  campaign_id: string
  lottery_number_id: string
  number: string
  description: string | null
  qty: number
}

export type StockEstablishmentRow = {
  campaign_id: string
  establishment_id: string
  establishment_name: string
  lottery_number_id: string
  number: string
  qty: number
}

export type NumberSummary = {
  campaign_id: string
  lottery_number_id: string
  number: string
  description: string | null
  purchased_qty: number
  central_qty: number
  distributed_qty: number
  sold_qty: number
  written_off_qty: number
  revenue_cents: number
  commission_cents: number
  purchase_cost_cents: number
}

export type FundByEstablishment = {
  campaign_id: string
  establishment_id: string
  establishment_name: string
  sold_qty: number
  commission_cents: number
}

export type IntegrityCheck = {
  campaign_id: string
  campaign_name: string
  purchased_qty: number
  central_qty: number
  establishment_qty: number
  sold_qty: number
  written_off_qty: number
  inventory_difference_qty: number
  money_difference_cents: number
  negative_central_numbers: number
  negative_establishment_stocks: number
  balanced: boolean
}

export type CountLine = {
  id: string
  count_movement_id: string
  lottery_number_id: string
  expected_qty: number
  counted_qty: number
  difference_qty: number
  created_at: string
}

export type PurchaseLineInput = {
  number: string
  quantity: number
  unit_price_cents?: number
}

export type CountLineInput = {
  lottery_number_id: string
  counted_qty: number
}

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }
type View<Row> = { Row: Row; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>
      user_establishments: Table<{ user_id: string; establishment_id: string; created_at: string }>
      establishments: Table<Establishment>
      campaigns: Table<Campaign>
      lottery_numbers: Table<LotteryNumber>
      movements: Table<Movement>
      count_lines: Table<CountLine>
    }
    Views: {
      v_stock_central: View<StockCentralRow>
      v_stock_establishment: View<StockEstablishmentRow>
      v_number_summary: View<NumberSummary>
      v_establishment_summary: View<EstablishmentDashboard>
      v_establishment_dashboard: View<EstablishmentDashboard>
      v_campaign_summary: View<CampaignSummary>
      v_fund_by_establishment: View<FundByEstablishment>
      v_integrity_check: View<IntegrityCheck>
      v_movements_detailed: View<MovementDetailed>
    }
    Functions: {
      api_create_purchase: {
        Args: {
          p_campaign_id: string
          p_lines: PurchaseLineInput[]
          p_occurred_on?: string
          p_supplier?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      api_capital_injection: {
        Args: {
          p_campaign_id: string
          p_amount_cents: number
          p_occurred_on?: string
          p_concept?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      api_deliver: {
        Args: {
          p_establishment_id: string
          p_lottery_number_id: string
          p_quantity: number
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_return: {
        Args: {
          p_establishment_id: string
          p_lottery_number_id: string
          p_quantity: number
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_sale: {
        Args: {
          p_establishment_id: string
          p_lottery_number_id: string
          p_quantity: number
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_register_count: {
        Args: {
          p_establishment_id: string
          p_campaign_id: string
          p_lines: CountLineInput[]
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_withdraw: {
        Args: {
          p_establishment_id: string
          p_campaign_id: string
          p_amount_cents: number
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_fund_expense: {
        Args: {
          p_campaign_id: string
          p_concept: string
          p_amount_cents: number
          p_occurred_on?: string
          p_notes?: string | null
        }
        Returns: string
      }
      api_adjust_stock: {
        Args: {
          p_lottery_number_id: string
          p_establishment_id: string | null
          p_delta_qty: number
          p_reason: string
          p_occurred_on?: string
        }
        Returns: string
      }
      api_void_movement: {
        Args: { p_movement_id: string; p_reason?: string | null }
        Returns: number
      }
    }
    Enums: { app_role: AppRole; movement_type: MovementType }
    CompositeTypes: Record<string, never>
  }
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase: 'Compra',
  capital_injection: 'Aportación de dinero',
  delivery: 'Entrega a establecimiento',
  return: 'Devolución',
  sale: 'Venta',
  count: 'Recuento',
  adjustment: 'Ajuste',
  withdrawal: 'Retirada de efectivo',
  fund_expense: 'Gasto del Fondo Fiesta',
}
