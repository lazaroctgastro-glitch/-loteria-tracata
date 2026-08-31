import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
  Campaign,
  CampaignSummary,
  CountLine,
  Establishment,
  EstablishmentDashboard,
  FundByEstablishment,
  IntegrityCheck,
  LotteryNumber,
  MovementDetailed,
  MovementType,
  NumberSummary,
  Profile,
  SalesSinceWithdrawal,
  StockCentralRow,
  StockEstablishmentRow,
} from '@/lib/database.types'

export const getCampaigns = cache(async (): Promise<Campaign[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .order('is_default', { ascending: false })
    .order('year', { ascending: false })
  return data ?? []
})

/** Campaña sobre la que trabaja la aplicación (la marcada por defecto). */
export const getActiveCampaign = cache(async (): Promise<Campaign | null> => {
  const campaigns = await getCampaigns()
  return campaigns.find((c) => c.is_default) ?? campaigns[0] ?? null
})

export const getCampaignSummary = cache(
  async (campaignId: string): Promise<CampaignSummary | null> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('v_campaign_summary')
      .select('*')
      .eq('campaign_id', campaignId)
      .maybeSingle()
    return data ?? null
  },
)

export const getEstablishmentCards = cache(
  async (campaignId: string): Promise<EstablishmentDashboard[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('v_establishment_dashboard')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('sort_order')
      .order('establishment_name')
    return data ?? []
  },
)

export const getEstablishments = cache(async (): Promise<Establishment[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('establishments')
    .select('*')
    .order('sort_order')
    .order('name')
  return data ?? []
})

export const getEstablishment = cache(async (id: string): Promise<Establishment | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('establishments').select('*').eq('id', id).maybeSingle()
  return data ?? null
})

export const getEstablishmentCard = cache(
  async (campaignId: string, establishmentId: string): Promise<EstablishmentDashboard | null> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('v_establishment_dashboard')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('establishment_id', establishmentId)
      .maybeSingle()
    return data ?? null
  },
)

export const getCentralStock = cache(async (campaignId: string): Promise<StockCentralRow[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_stock_central')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('number')
  return data ?? []
})

export const getEstablishmentStock = cache(
  async (campaignId: string, establishmentId?: string): Promise<StockEstablishmentRow[]> => {
    const supabase = await createClient()
    let query = supabase
      .from('v_stock_establishment')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('establishment_name')
      .order('number')
    if (establishmentId) query = query.eq('establishment_id', establishmentId)
    const { data } = await query
    return data ?? []
  },
)

export const getLotteryNumbers = cache(async (campaignId: string): Promise<LotteryNumber[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lottery_numbers')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('number')
  return data ?? []
})

export const getNumberSummary = cache(async (campaignId: string): Promise<NumberSummary[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_number_summary')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('number')
  return data ?? []
})

export const getFundByEstablishment = cache(
  async (campaignId: string): Promise<FundByEstablishment[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('v_fund_by_establishment')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('commission_cents', { ascending: false })
    return data ?? []
  },
)

export const getIntegrityCheck = cache(async (campaignId: string): Promise<IntegrityCheck | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_integrity_check')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  return data ?? null
})

/** Ventas de cada establecimiento posteriores a su última retirada de efectivo. */
export const getSalesSinceLastWithdrawal = cache(
  async (campaignId: string): Promise<SalesSinceWithdrawal[]> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('v_sales_since_last_withdrawal')
      .select('*')
      .eq('campaign_id', campaignId)
    return data ?? []
  },
)

export type MovementFilters = {
  campaignId?: string
  establishmentId?: string
  lotteryNumberId?: string
  type?: MovementType
  from?: string
  to?: string
  limit?: number
}

export async function getMovements(filters: MovementFilters = {}): Promise<MovementDetailed[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_movements_detailed')
    .select('*')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200)

  if (filters.campaignId) query = query.eq('campaign_id', filters.campaignId)
  if (filters.establishmentId) query = query.eq('establishment_id', filters.establishmentId)
  if (filters.lotteryNumberId) query = query.eq('lottery_number_id', filters.lotteryNumberId)
  if (filters.type) query = query.eq('type', filters.type)
  if (filters.from) query = query.gte('occurred_on', filters.from)
  if (filters.to) query = query.lte('occurred_on', filters.to)

  const { data } = await query
  return data ?? []
}

export async function getCountLines(countMovementId: string): Promise<CountLine[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('count_lines')
    .select('*')
    .eq('count_movement_id', countMovementId)
  return data ?? []
}

export const getProfiles = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').order('role').order('email')
  return data ?? []
})

export const getUserEstablishments = cache(
  async (): Promise<Array<{ user_id: string; establishment_id: string }>> => {
    const supabase = await createClient()
    const { data } = await supabase.from('user_establishments').select('user_id, establishment_id')
    return data ?? []
  },
)
