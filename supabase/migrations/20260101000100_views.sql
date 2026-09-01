-- =============================================================================
-- Vistas de cálculo. NADA se guarda acumulado: todo se suma desde `movements`.
-- security_invoker = true  ->  las vistas respetan la RLS del usuario.
-- =============================================================================

-- Las vistas se recrean desde cero en cada instalación. `create or replace`
-- no permite quitar ni reordenar columnas, así que una versión posterior que
-- añada columnas haría fallar la reinstalación. Se eliminan primero, en orden
-- inverso al de dependencias. Una vista no guarda datos: borrarla no pierde nada.
drop view if exists v_movements_detailed cascade;
drop view if exists v_supplier_account cascade;
drop view if exists v_sales_since_last_withdrawal cascade;
drop view if exists v_integrity_check cascade;
drop view if exists v_fund_by_establishment cascade;
drop view if exists v_campaign_summary cascade;
drop view if exists v_establishment_dashboard cascade;
drop view if exists v_establishment_summary cascade;
drop view if exists v_number_summary cascade;
drop view if exists v_stock_establishment cascade;
drop view if exists v_stock_central cascade;

-- --------------------------- STOCK CENTRAL ---------------------------------
create or replace view v_stock_central
with (security_invoker = true) as
select
  ln.campaign_id,
  ln.id            as lottery_number_id,
  ln.number,
  ln.description,
  coalesce(sum(m.d_central_qty), 0)::integer as qty
from lottery_numbers ln
left join movements m on m.lottery_number_id = ln.id
group by ln.campaign_id, ln.id, ln.number, ln.description;

-- ----------------------- STOCK POR ESTABLECIMIENTO -------------------------
create or replace view v_stock_establishment
with (security_invoker = true) as
select
  m.campaign_id,
  m.establishment_id,
  e.name           as establishment_name,
  m.lottery_number_id,
  ln.number,
  sum(m.d_establishment_qty)::integer as qty
from movements m
join establishments e on e.id = m.establishment_id
join lottery_numbers ln on ln.id = m.lottery_number_id
where m.establishment_id is not null and m.lottery_number_id is not null
group by m.campaign_id, m.establishment_id, e.name, m.lottery_number_id, ln.number
having sum(m.d_establishment_qty) <> 0;

-- ------------------- RESUMEN POR NÚMERO DE LOTERÍA -------------------------
create or replace view v_number_summary
with (security_invoker = true) as
select
  ln.campaign_id,
  ln.id     as lottery_number_id,
  ln.number,
  ln.description,
  coalesce(sum(m.d_purchased_qty), 0)::integer      as purchased_qty,
  coalesce(sum(m.d_central_qty), 0)::integer        as central_qty,
  coalesce(sum(m.d_establishment_qty), 0)::integer  as distributed_qty,
  coalesce(sum(m.d_sold_qty), 0)::integer           as sold_qty,
  coalesce(sum(m.d_written_off_qty), 0)::integer    as written_off_qty,
  coalesce(sum(m.d_revenue_cents), 0)::bigint       as revenue_cents,
  coalesce(sum(m.d_commission_cents), 0)::bigint    as commission_cents,
  coalesce(sum(case when m.type = 'purchase' then -m.d_central_cash_cents else 0 end), 0)::bigint
                                                    as purchase_cost_cents
from lottery_numbers ln
left join movements m on m.lottery_number_id = ln.id
group by ln.campaign_id, ln.id, ln.number, ln.description;

-- -------------------- RESUMEN POR ESTABLECIMIENTO --------------------------
-- Los movimientos de anulación llevan el MISMO `type` con los deltas negados,
-- por lo que todos estos totales quedan netos de anulaciones automáticamente.
create or replace view v_establishment_summary
with (security_invoker = true) as
select
  m.campaign_id,
  e.id                        as establishment_id,
  e.name                      as establishment_name,
  e.is_active,
  coalesce(sum(m.d_establishment_qty) filter (where m.type = 'delivery'), 0)::integer   as delivered_qty,
  coalesce(-sum(m.d_establishment_qty) filter (where m.type = 'return'), 0)::integer    as returned_qty,
  coalesce(sum(m.d_sold_qty), 0)::integer                                               as sold_qty,
  coalesce(sum(m.d_establishment_qty), 0)::integer                                      as stock_qty,
  coalesce(-sum(m.d_written_off_qty) filter (where m.type = 'adjustment'), 0)::integer  as adjusted_qty,
  coalesce(sum(m.d_revenue_cents), 0)::bigint                                           as revenue_cents,
  coalesce(sum(m.d_capital_cents), 0)::bigint                                           as capital_cents,
  coalesce(sum(m.d_commission_cents), 0)::bigint                                        as commission_cents,
  coalesce(sum(m.d_pending_cents), 0)::bigint                                           as pending_cents,
  coalesce(sum(m.d_central_cash_cents) filter (where m.type = 'withdrawal'), 0)::bigint as withdrawn_cents,
  max(m.occurred_on) filter (
    where m.type = 'withdrawal'
      and m.reverses_movement_id is null
      and m.reversed_by_movement_id is null)                                            as last_withdrawal_on,
  max(m.occurred_on) filter (where m.type = 'sale')                                     as last_sale_on,
  max(m.occurred_on) filter (where m.type = 'count')                                    as last_count_on
from establishments e
join movements m on m.establishment_id = e.id
group by m.campaign_id, e.id, e.name, e.is_active;

-- Igual que la anterior pero incluyendo bares todavía sin ningún movimiento,
-- para que el dashboard muestre siempre las 5 tarjetas.
create or replace view v_establishment_dashboard
with (security_invoker = true) as
select
  c.id                                   as campaign_id,
  e.id                                   as establishment_id,
  e.name                                 as establishment_name,
  e.manager_name,
  e.is_active,
  e.sort_order,
  coalesce(s.delivered_qty, 0)           as delivered_qty,
  coalesce(s.returned_qty, 0)            as returned_qty,
  coalesce(s.sold_qty, 0)                as sold_qty,
  coalesce(s.stock_qty, 0)               as stock_qty,
  coalesce(s.adjusted_qty, 0)            as adjusted_qty,
  coalesce(s.revenue_cents, 0)           as revenue_cents,
  coalesce(s.capital_cents, 0)           as capital_cents,
  coalesce(s.commission_cents, 0)        as commission_cents,
  coalesce(s.pending_cents, 0)           as pending_cents,
  coalesce(s.withdrawn_cents, 0)         as withdrawn_cents,
  s.last_withdrawal_on,
  s.last_sale_on,
  s.last_count_on
from establishments e
cross join campaigns c
left join v_establishment_summary s
  on s.establishment_id = e.id and s.campaign_id = c.id;

-- ------------------------ RESUMEN DE CAMPAÑA -------------------------------
create or replace view v_campaign_summary
with (security_invoker = true) as
select
  c.id                                   as campaign_id,
  c.name                                 as campaign_name,
  c.year,
  c.purchase_price_cents,
  c.sale_price_cents,
  (c.sale_price_cents - c.purchase_price_cents)                      as commission_price_cents,
  coalesce(sum(m.d_purchased_qty), 0)::integer                       as purchased_qty,
  coalesce(sum(m.d_sold_qty), 0)::integer                            as sold_qty,
  coalesce(sum(m.d_central_qty), 0)::integer                         as central_stock_qty,
  coalesce(sum(m.d_establishment_qty), 0)::integer                   as establishment_stock_qty,
  coalesce(sum(m.d_central_qty) + sum(m.d_establishment_qty), 0)::integer as total_stock_qty,
  coalesce(sum(m.d_written_off_qty), 0)::integer                     as written_off_qty,
  coalesce(sum(m.d_revenue_cents), 0)::bigint                        as revenue_cents,
  coalesce(sum(m.d_capital_cents), 0)::bigint                        as capital_recovered_cents,
  coalesce(sum(m.d_commission_cents), 0)::bigint                     as commission_cents,
  coalesce(sum(m.d_pending_cents), 0)::bigint                        as pending_in_establishments_cents,
  coalesce(sum(m.d_central_cash_cents) filter (where m.type = 'withdrawal'), 0)::bigint as withdrawn_cents,
  coalesce(-sum(m.d_central_cash_cents) filter (where m.type = 'purchase'), 0)::bigint  as purchases_cost_cents,
  coalesce(sum(m.d_central_cash_cents) filter (where m.type = 'capital_injection'), 0)::bigint as injected_cents,
  coalesce(sum(m.d_fund_expense_cents), 0)::bigint                   as fund_expenses_cents,
  coalesce(sum(m.d_commission_cents) - sum(m.d_fund_expense_cents), 0)::bigint as fund_balance_cents,
  coalesce(sum(m.d_central_cash_cents), 0)::bigint                   as central_cash_cents
from campaigns c
left join movements m on m.campaign_id = c.id
group by c.id, c.name, c.year, c.purchase_price_cents, c.sale_price_cents;

-- --------------------------- FONDO FIESTA ----------------------------------
create or replace view v_fund_by_establishment
with (security_invoker = true) as
select
  m.campaign_id,
  e.id                                          as establishment_id,
  e.name                                        as establishment_name,
  coalesce(sum(m.d_sold_qty), 0)::integer       as sold_qty,
  coalesce(sum(m.d_commission_cents), 0)::bigint as commission_cents
from establishments e
join movements m on m.establishment_id = e.id
group by m.campaign_id, e.id, e.name
having sum(m.d_commission_cents) <> 0 or sum(m.d_sold_qty) <> 0;

-- ------------------- CONTROL AUTOMÁTICO DE INTEGRIDAD ----------------------
-- Debe devolver siempre balanced = true. Si alguna vez fuese false, la
-- pantalla de Configuración lo muestra en rojo como DESCUADRE.
create or replace view v_integrity_check
with (security_invoker = true) as
select
  c.id                                                          as campaign_id,
  c.name                                                        as campaign_name,
  coalesce(sum(m.d_purchased_qty), 0)::integer                  as purchased_qty,
  coalesce(sum(m.d_central_qty), 0)::integer                    as central_qty,
  coalesce(sum(m.d_establishment_qty), 0)::integer              as establishment_qty,
  coalesce(sum(m.d_sold_qty), 0)::integer                       as sold_qty,
  coalesce(sum(m.d_written_off_qty), 0)::integer                as written_off_qty,
  coalesce(sum(m.d_purchased_qty)
         - sum(m.d_central_qty) - sum(m.d_establishment_qty)
         - sum(m.d_sold_qty) - sum(m.d_written_off_qty), 0)::integer as inventory_difference_qty,
  coalesce(sum(m.d_revenue_cents)
         - sum(m.d_capital_cents) - sum(m.d_commission_cents), 0)::bigint as money_difference_cents,
  (select count(*) from v_stock_central sc where sc.campaign_id = c.id and sc.qty < 0)      as negative_central_numbers,
  (select count(*) from v_stock_establishment se where se.campaign_id = c.id and se.qty < 0) as negative_establishment_stocks,
  (coalesce(sum(m.d_purchased_qty)
          - sum(m.d_central_qty) - sum(m.d_establishment_qty)
          - sum(m.d_sold_qty) - sum(m.d_written_off_qty), 0) = 0
   and coalesce(sum(m.d_revenue_cents)
          - sum(m.d_capital_cents) - sum(m.d_commission_cents), 0) = 0
   and (select count(*) from v_stock_central sc where sc.campaign_id = c.id and sc.qty < 0) = 0
   and (select count(*) from v_stock_establishment se where se.campaign_id = c.id and se.qty < 0) = 0
  ) as balanced
from campaigns c
left join movements m on m.campaign_id = c.id
group by c.id, c.name;

-- ------------------- MOVIMIENTOS CON DATOS LEGIBLES ------------------------
create or replace view v_movements_detailed
with (security_invoker = true) as
select
  m.*,
  e.name  as establishment_name,
  ln.number as lottery_number,
  p.full_name as created_by_name,
  (m.reversed_by_movement_id is not null) as is_reversed,
  (m.reverses_movement_id is not null)    as is_reversal
from movements m
left join establishments e on e.id = m.establishment_id
left join lottery_numbers ln on ln.id = m.lottery_number_id
left join profiles p on p.id = m.created_by;

-- --------------- VENTAS DESDE LA ÚLTIMA RETIRADA DE EFECTIVO ---------------
-- Alimenta la pantalla "Retirar dinero": cuántos décimos se han vendido y
-- cuánto dinero debería haber aparecido en la caja desde la última visita.
create or replace view v_sales_since_last_withdrawal
with (security_invoker = true) as
with last_withdrawal as (
  -- Solo cuentan las retiradas EFECTIVAS: se ignoran las anulaciones y las
  -- retiradas anuladas, para que al anular una retirada vuelvan a contarse
  -- las ventas que quedaron otra vez pendientes de cobrar.
  select campaign_id, establishment_id, max(created_at) as at
  from movements
  where type = 'withdrawal'
    and establishment_id is not null
    and reverses_movement_id is null
    and reversed_by_movement_id is null
  group by campaign_id, establishment_id
)
select
  m.campaign_id,
  m.establishment_id,
  lw.at                                              as last_withdrawal_at,
  coalesce(sum(m.d_sold_qty), 0)::integer            as sold_qty,
  coalesce(sum(m.d_revenue_cents), 0)::bigint        as revenue_cents
from movements m
left join last_withdrawal lw
  on lw.campaign_id = m.campaign_id and lw.establishment_id = m.establishment_id
where m.establishment_id is not null
  and (lw.at is null or m.created_at > lw.at)
group by m.campaign_id, m.establishment_id, lw.at;
