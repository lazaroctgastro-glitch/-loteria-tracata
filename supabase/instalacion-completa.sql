-- =============================================================================
-- LOTERÍA TRACATÁ · Instalación completa de la base de datos
--
-- Archivo generado automáticamente: NO lo edites a mano.
-- Se crea a partir de supabase/migrations/ con:  node scripts/build-install-sql.mjs
--
-- CÓMO USARLO
--   1. Entra en tu proyecto de Supabase.
--   2. Menú lateral -> SQL Editor -> New query.
--   3. Copia TODO este archivo, pégalo y pulsa "Run".
--
-- Se puede ejecutar más de una vez sin estropear nada.
-- =============================================================================

-- ===========================================================================
-- Bloque: 20260101000000_schema.sql
-- ===========================================================================

-- =============================================================================
-- LOTERÍA TRACATÁ · Esquema base
-- Contabilidad por movimientos (libro mayor append-only).
-- Todo el dinero se guarda en CÉNTIMOS ENTEROS. Las cantidades son enteros.
-- =============================================================================

-- gen_random_uuid() forma parte del núcleo de PostgreSQL desde la versión 13,
-- por lo que el esquema no necesita ninguna extensión adicional.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum (
    'purchase',           -- compra de décimos a la administración
    'capital_injection',  -- aportación de dinero a la caja central
    'delivery',           -- entrega de décimos a un establecimiento
    'return',             -- devolución de décimos al almacén central
    'sale',               -- venta de décimos en un establecimiento
    'count',              -- recuento físico (auditoría, sin efectos)
    'adjustment',         -- ajuste / baja de inventario
    'withdrawal',         -- retirada de efectivo de un establecimiento
    'fund_expense'        -- gasto contra el fondo fiesta
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        app_role not null default 'manager',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table profiles is 'Perfil de aplicación de cada usuario autenticado.';

create table if not exists user_establishments (
  user_id          uuid not null references profiles (id) on delete cascade,
  establishment_id uuid not null,
  created_at       timestamptz not null default now(),
  primary key (user_id, establishment_id)
);

comment on table user_establishments is
  'Establecimientos que puede ver/operar un responsable. Los admin ven todos.';

-- ---------------------------------------------------------------------------
-- Establecimientos
-- ---------------------------------------------------------------------------
create table if not exists establishments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  manager_name text,
  notes        text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint establishments_name_unique unique (name),
  constraint establishments_name_not_blank check (length(btrim(name)) > 0)
);

alter table user_establishments
  drop constraint if exists user_establishments_establishment_id_fkey;
alter table user_establishments
  add constraint user_establishments_establishment_id_fkey
  foreign key (establishment_id) references establishments (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Campañas (precios configurables, nunca hardcodeados)
-- ---------------------------------------------------------------------------
create table if not exists campaigns (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  year                 integer not null,
  purchase_price_cents integer not null default 2000,
  sale_price_cents     integer not null default 2300,
  is_active            boolean not null default true,
  is_default           boolean not null default false,
  created_at           timestamptz not null default now(),
  constraint campaigns_name_unique unique (name),
  constraint campaigns_purchase_price_positive check (purchase_price_cents > 0),
  constraint campaigns_sale_price_positive check (sale_price_cents > 0),
  -- la comisión SIEMPRE se deriva de (venta - compra) y no puede ser negativa
  constraint campaigns_sale_ge_purchase check (sale_price_cents >= purchase_price_cents)
);

create unique index if not exists campaigns_single_default
  on campaigns (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- Números de lotería
-- ---------------------------------------------------------------------------
create table if not exists lottery_numbers (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete restrict,
  number      text not null,
  description text,
  created_at  timestamptz not null default now(),
  -- número de lotería obligatorio y de 5 cifras
  constraint lottery_numbers_format check (number ~ '^[0-9]{5}$'),
  constraint lottery_numbers_unique_per_campaign unique (campaign_id, number)
);

-- ---------------------------------------------------------------------------
-- LIBRO MAYOR (append-only). Fuente de verdad de TODO.
-- ---------------------------------------------------------------------------
create table if not exists movements (
  id                       uuid primary key default gen_random_uuid(),
  campaign_id              uuid not null references campaigns (id) on delete restrict,
  type                     movement_type not null,
  occurred_on              date not null default current_date,
  created_at               timestamptz not null default now(),
  created_by               uuid references profiles (id) on delete set null,
  created_by_email         text,
  establishment_id         uuid references establishments (id) on delete restrict,
  lottery_number_id        uuid references lottery_numbers (id) on delete restrict,

  -- datos informativos de la operación
  quantity                 integer not null default 0,
  unit_price_cents         integer,
  amount_cents             integer not null default 0,
  -- En una retirada, lo que la aplicación esperaba encontrar en la caja. Se
  -- guarda para que cada liquidación quede auditable (esperado vs retirado).
  expected_amount_cents    integer,
  concept                  text,
  notes                    text,
  supplier                 text,
  group_id                 uuid,

  -- anulación (nunca se borra: se crea el movimiento inverso)
  reverses_movement_id     uuid references movements (id) on delete restrict,
  reversed_by_movement_id  uuid references movements (id) on delete restrict,

  -- ---------- EFECTOS (deltas con signo) : la fuente de verdad ----------
  d_purchased_qty          integer not null default 0,
  d_central_qty            integer not null default 0,
  d_establishment_qty      integer not null default 0,
  d_sold_qty               integer not null default 0,
  d_written_off_qty        integer not null default 0,
  d_pending_cents          integer not null default 0,
  d_central_cash_cents     integer not null default 0,
  d_revenue_cents          integer not null default 0,
  d_capital_cents          integer not null default 0,
  d_commission_cents       integer not null default 0,
  d_fund_expense_cents     integer not null default 0,

  -- INVARIANTE DE INVENTARIO: comprados = central + bares + vendidos + bajas
  constraint movements_inventory_balance check (
    d_purchased_qty = d_central_qty + d_establishment_qty + d_sold_qty + d_written_off_qty
  ),
  -- INVARIANTE DE DINERO: facturación = capital recuperado + comisión
  constraint movements_money_split check (
    d_revenue_cents = d_capital_cents + d_commission_cents
  ),
  constraint movements_quantity_non_negative check (quantity >= 0),
  -- todo delta sobre el stock de un bar debe identificar el bar y el número
  constraint movements_establishment_required check (
    d_establishment_qty = 0 or establishment_id is not null
  ),
  constraint movements_number_required check (
    (d_central_qty = 0 and d_establishment_qty = 0 and d_sold_qty = 0)
    or lottery_number_id is not null
  ),
  constraint movements_pending_requires_establishment check (
    d_pending_cents = 0 or establishment_id is not null
  )
);

comment on table movements is
  'Libro mayor append-only. No se puede actualizar ni borrar (ver triggers). '
  'Para corregir un error se anula creando el movimiento inverso.';

create index if not exists movements_campaign_idx on movements (campaign_id, occurred_on desc, created_at desc);
create index if not exists movements_establishment_idx on movements (establishment_id, created_at desc);
create index if not exists movements_number_idx on movements (lottery_number_id);
create index if not exists movements_type_idx on movements (type);
create index if not exists movements_group_idx on movements (group_id);
create unique index if not exists movements_one_reversal_per_movement
  on movements (reverses_movement_id) where reverses_movement_id is not null;

-- ---------------------------------------------------------------------------
-- Detalle del recuento físico (auditoría de arqueos)
-- ---------------------------------------------------------------------------
create table if not exists count_lines (
  id                 uuid primary key default gen_random_uuid(),
  count_movement_id  uuid not null references movements (id) on delete cascade,
  lottery_number_id  uuid not null references lottery_numbers (id) on delete restrict,
  expected_qty       integer not null,
  counted_qty        integer not null,
  difference_qty     integer not null,
  created_at         timestamptz not null default now(),
  constraint count_lines_counted_non_negative check (counted_qty >= 0),
  constraint count_lines_difference_coherent check (difference_qty = counted_qty - expected_qty)
);

-- ---------------------------------------------------------------------------
-- Append-only: prohibido UPDATE y DELETE sobre el libro mayor
-- ---------------------------------------------------------------------------
create or replace function movements_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Los movimientos no se pueden borrar. Utiliza "Anular movimiento".'
    using errcode = 'check_violation';
end $$;

create or replace function movements_block_update() returns trigger
language plpgsql as $$
begin
  -- La única modificación permitida es marcar un movimiento como anulado,
  -- y solo la realizan las funciones internas de la aplicación.
  if coalesce(current_setting('app.allow_movement_link', true), 'off') <> 'on' then
    raise exception 'Los movimientos no se pueden modificar. Utiliza "Anular movimiento".'
      using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'reversed_by_movement_id') <> (to_jsonb(old) - 'reversed_by_movement_id') then
    raise exception 'Solo se puede marcar un movimiento como anulado.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists movements_no_delete on movements;
create trigger movements_no_delete before delete on movements
  for each row execute function movements_block_delete();

drop trigger if exists movements_no_update on movements;
create trigger movements_no_update before update on movements
  for each row execute function movements_block_update();

-- ---------------------------------------------------------------------------
-- No borrar establecimientos con movimientos asociados
-- ---------------------------------------------------------------------------
create or replace function establishments_block_delete_with_movements() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from movements where establishment_id = old.id) then
    raise exception 'No se puede eliminar "%": tiene movimientos registrados. Archívalo en su lugar.', old.name
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end $$;

drop trigger if exists establishments_no_delete_with_movements on establishments;
create trigger establishments_no_delete_with_movements before delete on establishments
  for each row execute function establishments_block_delete_with_movements();

-- ===========================================================================
-- Bloque: 20260101000100_views.sql
-- ===========================================================================

-- =============================================================================
-- Vistas de cálculo. NADA se guarda acumulado: todo se suma desde `movements`.
-- security_invoker = true  ->  las vistas respetan la RLS del usuario.
-- =============================================================================

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

-- ===========================================================================
-- Bloque: 20260101000200_functions.sql
-- ===========================================================================

-- =============================================================================
-- Funciones de escritura. TODA modificación del libro mayor pasa por aquí.
-- Son SECURITY DEFINER y comprueban permisos explícitamente, de modo que los
-- permisos se aplican en la base de datos y no solo ocultando botones.
-- =============================================================================

-- ------------------------- Identidad y permisos ----------------------------
create or replace function app_current_user_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    auth.uid(),
    -- Vía exclusiva para migraciones y seed. Se comprueba `session_user` y no
    -- `current_user` porque dentro de una función SECURITY DEFINER `current_user`
    -- ya es el propietario, mientras que `session_user` sigue siendo quien se
    -- conectó: así una petición de la aplicación nunca puede entrar por aquí.
    case when session_user in ('postgres', 'supabase_admin')
         then nullif(current_setting('app.acting_user', true), '')::uuid end
  );
$$;

create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = app_current_user_id() and p.role = 'admin' and p.is_active
  );
$$;

create or replace function app_can_access_establishment(p_establishment_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_is_admin() or exists (
    select 1
    from user_establishments ue
    join profiles p on p.id = ue.user_id
    where ue.user_id = app_current_user_id()
      and ue.establishment_id = p_establishment_id
      and p.is_active
  );
$$;

create or replace function app_assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app_is_admin() then
    raise exception 'Solo un administrador puede realizar esta operación.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function app_assert_establishment_access(p_establishment_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app_can_access_establishment(p_establishment_id) then
    raise exception 'No tienes permiso sobre este establecimiento.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ------------------ Bloqueos (evitan stock negativo en carrera) ------------
create or replace function app_lock_central(p_lottery_number_id uuid) returns void
language sql set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended('central:' || p_lottery_number_id::text, 0));
$$;

create or replace function app_lock_establishment(p_establishment_id uuid, p_lottery_number_id uuid)
returns void language sql set search_path = public as $$
  select pg_advisory_xact_lock(
    hashtextextended('est:' || p_establishment_id::text || ':' || p_lottery_number_id::text, 0));
$$;

create or replace function app_lock_cash(p_establishment_id uuid) returns void
language sql set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended('cash:' || p_establishment_id::text, 0));
$$;

-- ------------------------- Lecturas internas -------------------------------
create or replace function app_central_stock(p_lottery_number_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(d_central_qty), 0)::integer
  from movements where lottery_number_id = p_lottery_number_id;
$$;

create or replace function app_establishment_stock(p_establishment_id uuid, p_lottery_number_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(d_establishment_qty), 0)::integer
  from movements
  where establishment_id = p_establishment_id and lottery_number_id = p_lottery_number_id;
$$;

create or replace function app_pending_cents(p_establishment_id uuid, p_campaign_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(d_pending_cents), 0)::bigint
  from movements
  where establishment_id = p_establishment_id and campaign_id = p_campaign_id;
$$;

-- ------------------------ Inserción de movimiento --------------------------
create or replace function app_new_movement(
  p_campaign_id           uuid,
  p_type                  movement_type,
  p_occurred_on           date         default current_date,
  p_establishment_id      uuid         default null,
  p_lottery_number_id     uuid         default null,
  p_quantity              integer      default 0,
  p_unit_price_cents      integer      default null,
  p_amount_cents          integer      default 0,
  p_expected_amount_cents integer      default null,
  p_concept               text         default null,
  p_notes                 text         default null,
  p_supplier              text         default null,
  p_group_id              uuid         default null,
  p_reverses              uuid         default null,
  p_d_purchased_qty       integer      default 0,
  p_d_central_qty         integer      default 0,
  p_d_establishment_qty   integer      default 0,
  p_d_sold_qty            integer      default 0,
  p_d_written_off_qty     integer      default 0,
  p_d_pending_cents       integer      default 0,
  p_d_central_cash_cents  integer      default 0,
  p_d_revenue_cents       integer      default 0,
  p_d_capital_cents       integer      default 0,
  p_d_commission_cents    integer      default 0,
  p_d_fund_expense_cents  integer      default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_user uuid := app_current_user_id();
  v_email text;
begin
  -- Un movimiento nunca puede apuntar a un número de otra campaña: si no, los
  -- recuentos de stock por campaña y por número dejarían de coincidir.
  if p_lottery_number_id is not null and not exists (
    select 1 from lottery_numbers
    where id = p_lottery_number_id and campaign_id = p_campaign_id
  ) then
    raise exception 'El número de lotería no pertenece a esa campaña.'
      using errcode = 'check_violation';
  end if;

  select email into v_email from profiles where id = v_user;

  insert into movements (
    campaign_id, type, occurred_on, created_by, created_by_email,
    establishment_id, lottery_number_id, quantity, unit_price_cents, amount_cents,
    expected_amount_cents, concept, notes, supplier, group_id, reverses_movement_id,
    d_purchased_qty, d_central_qty, d_establishment_qty, d_sold_qty, d_written_off_qty,
    d_pending_cents, d_central_cash_cents, d_revenue_cents, d_capital_cents,
    d_commission_cents, d_fund_expense_cents
  ) values (
    p_campaign_id, p_type, coalesce(p_occurred_on, current_date), v_user, v_email,
    p_establishment_id, p_lottery_number_id, p_quantity, p_unit_price_cents, p_amount_cents,
    p_expected_amount_cents, p_concept, p_notes, p_supplier, p_group_id, p_reverses,
    p_d_purchased_qty, p_d_central_qty, p_d_establishment_qty, p_d_sold_qty, p_d_written_off_qty,
    p_d_pending_cents, p_d_central_cash_cents, p_d_revenue_cents, p_d_capital_cents,
    p_d_commission_cents, p_d_fund_expense_cents
  ) returning id into v_id;

  return v_id;
end $$;

-- =============================================================================
-- 1. COMPRA DE LOTERÍA
--    p_lines: [{ "number": "69588", "quantity": 100, "unit_price_cents": 2000 }]
-- =============================================================================
create or replace function api_create_purchase(
  p_campaign_id uuid,
  p_lines       jsonb,
  p_occurred_on date default current_date,
  p_supplier    text default null,
  p_notes       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_line jsonb;
  v_number text;
  v_qty integer;
  v_price integer;
  v_number_id uuid;
  v_default_price integer;
begin
  perform app_assert_admin();

  select purchase_price_cents into v_default_price from campaigns where id = p_campaign_id;
  if v_default_price is null then
    raise exception 'La campaña indicada no existe.' using errcode = 'no_data_found';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debes indicar al menos un número de lotería.' using errcode = 'check_violation';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_number := btrim(v_line ->> 'number');
    v_qty    := (v_line ->> 'quantity')::integer;
    v_price  := coalesce((v_line ->> 'unit_price_cents')::integer, v_default_price);

    if v_number is null or v_number !~ '^[0-9]{5}$' then
      raise exception 'El número de lotería "%" no es válido: debe tener 5 cifras.', coalesce(v_number, '')
        using errcode = 'check_violation';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'La cantidad de décimos del número % debe ser mayor que 0.', v_number
        using errcode = 'check_violation';
    end if;
    if v_price <= 0 then
      raise exception 'El precio de compra debe ser mayor que 0.' using errcode = 'check_violation';
    end if;

    -- Comprar más décimos de un número ya existente SUMA stock, nunca sustituye.
    insert into lottery_numbers (campaign_id, number)
    values (p_campaign_id, v_number)
    on conflict (campaign_id, number) do nothing;

    select id into v_number_id from lottery_numbers
    where campaign_id = p_campaign_id and number = v_number;

    perform app_new_movement(
      p_campaign_id          => p_campaign_id,
      p_type                 => 'purchase',
      p_occurred_on          => p_occurred_on,
      p_lottery_number_id    => v_number_id,
      p_quantity             => v_qty,
      p_unit_price_cents     => v_price,
      p_amount_cents         => v_qty * v_price,
      p_notes                => p_notes,
      p_supplier             => p_supplier,
      p_group_id             => v_group,
      p_d_purchased_qty      => v_qty,
      p_d_central_qty        => v_qty,
      p_d_central_cash_cents => -(v_qty * v_price)
    );
  end loop;

  return v_group;
end $$;

-- =============================================================================
-- 2. APORTACIÓN DE DINERO A LA CAJA CENTRAL
-- =============================================================================
create or replace function api_capital_injection(
  p_campaign_id  uuid,
  p_amount_cents integer,
  p_occurred_on  date default current_date,
  p_concept      text default null,
  p_notes        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_admin();
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe debe ser mayor que 0 €.' using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id          => p_campaign_id,
    p_type                 => 'capital_injection',
    p_occurred_on          => p_occurred_on,
    p_amount_cents         => p_amount_cents,
    p_concept              => coalesce(p_concept, 'Aportación a la caja central'),
    p_notes                => p_notes,
    p_d_central_cash_cents => p_amount_cents
  );
end $$;

-- =============================================================================
-- 3. ENTREGA DE DÉCIMOS A UN ESTABLECIMIENTO
-- =============================================================================
create or replace function api_deliver(
  p_establishment_id  uuid,
  p_lottery_number_id uuid,
  p_quantity          integer,
  p_occurred_on       date default current_date,
  p_notes             text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_number text;
  v_available integer;
  v_establishment text;
begin
  perform app_assert_admin();

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de décimos debe ser mayor que 0.' using errcode = 'check_violation';
  end if;

  select ln.campaign_id, ln.number into v_campaign, v_number
  from lottery_numbers ln where ln.id = p_lottery_number_id;
  if v_campaign is null then
    raise exception 'El número de lotería indicado no existe.' using errcode = 'no_data_found';
  end if;

  select name into v_establishment from establishments where id = p_establishment_id;
  if v_establishment is null then
    raise exception 'El establecimiento indicado no existe.' using errcode = 'no_data_found';
  end if;

  perform app_lock_central(p_lottery_number_id);
  v_available := app_central_stock(p_lottery_number_id);

  if p_quantity > v_available then
    raise exception 'No hay décimos suficientes del número %. Disponibles: %, intentas entregar: %.',
      v_number, v_available, p_quantity using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id         => v_campaign,
    p_type                => 'delivery',
    p_occurred_on         => p_occurred_on,
    p_establishment_id    => p_establishment_id,
    p_lottery_number_id   => p_lottery_number_id,
    p_quantity            => p_quantity,
    p_notes               => p_notes,
    p_d_central_qty       => -p_quantity,
    p_d_establishment_qty => p_quantity
  );
end $$;

-- =============================================================================
-- 4. DEVOLUCIÓN DE DÉCIMOS AL ALMACÉN CENTRAL
-- =============================================================================
create or replace function api_return(
  p_establishment_id  uuid,
  p_lottery_number_id uuid,
  p_quantity          integer,
  p_occurred_on       date default current_date,
  p_notes             text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_number text;
  v_available integer;
begin
  perform app_assert_admin();

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de décimos debe ser mayor que 0.' using errcode = 'check_violation';
  end if;

  select ln.campaign_id, ln.number into v_campaign, v_number
  from lottery_numbers ln where ln.id = p_lottery_number_id;
  if v_campaign is null then
    raise exception 'El número de lotería indicado no existe.' using errcode = 'no_data_found';
  end if;

  perform app_lock_establishment(p_establishment_id, p_lottery_number_id);
  v_available := app_establishment_stock(p_establishment_id, p_lottery_number_id);

  if p_quantity > v_available then
    raise exception 'El establecimiento solo tiene % décimos del número %. No puedes devolver %.',
      v_available, v_number, p_quantity using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id         => v_campaign,
    p_type                => 'return',
    p_occurred_on         => p_occurred_on,
    p_establishment_id    => p_establishment_id,
    p_lottery_number_id   => p_lottery_number_id,
    p_quantity            => p_quantity,
    p_notes               => p_notes,
    p_d_central_qty       => p_quantity,
    p_d_establishment_qty => -p_quantity
  );
end $$;

-- =============================================================================
-- 5. REGISTRAR VENTA
-- =============================================================================
create or replace function app_register_sale(
  p_establishment_id  uuid,
  p_lottery_number_id uuid,
  p_quantity          integer,
  p_occurred_on       date,
  p_notes             text,
  p_group_id          uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_number text;
  v_available integer;
  v_sale integer;
  v_purchase integer;
  v_commission integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad vendida debe ser mayor que 0.' using errcode = 'check_violation';
  end if;

  select ln.campaign_id, ln.number into v_campaign, v_number
  from lottery_numbers ln where ln.id = p_lottery_number_id;
  if v_campaign is null then
    raise exception 'El número de lotería indicado no existe.' using errcode = 'no_data_found';
  end if;

  -- Los precios SIEMPRE vienen de la campaña; la comisión se deriva.
  select purchase_price_cents, sale_price_cents into v_purchase, v_sale
  from campaigns where id = v_campaign;
  v_commission := v_sale - v_purchase;

  perform app_lock_establishment(p_establishment_id, p_lottery_number_id);
  v_available := app_establishment_stock(p_establishment_id, p_lottery_number_id);

  if p_quantity > v_available then
    raise exception 'Solo quedan % décimos del número % en este establecimiento. No puedes vender %.',
      v_available, v_number, p_quantity using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id         => v_campaign,
    p_type                => 'sale',
    p_occurred_on         => p_occurred_on,
    p_establishment_id    => p_establishment_id,
    p_lottery_number_id   => p_lottery_number_id,
    p_quantity            => p_quantity,
    p_unit_price_cents    => v_sale,
    p_amount_cents        => p_quantity * v_sale,
    p_notes               => p_notes,
    p_group_id            => p_group_id,
    p_d_establishment_qty => -p_quantity,
    p_d_sold_qty          => p_quantity,
    p_d_pending_cents     => p_quantity * v_sale,
    p_d_revenue_cents     => p_quantity * v_sale,
    p_d_capital_cents     => p_quantity * v_purchase,
    p_d_commission_cents  => p_quantity * v_commission
  );
end $$;

create or replace function api_sale(
  p_establishment_id  uuid,
  p_lottery_number_id uuid,
  p_quantity          integer,
  p_occurred_on       date default current_date,
  p_notes             text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_establishment_access(p_establishment_id);
  return app_register_sale(p_establishment_id, p_lottery_number_id, p_quantity,
                           coalesce(p_occurred_on, current_date), p_notes, null);
end $$;

-- =============================================================================
-- 6. RECUENTO / ARQUEO DE LOTERÍA
--    p_lines: [{ "lottery_number_id": "...", "counted_qty": 14 }]
--    Nunca modifica el inventario en silencio: las faltas se registran como
--    ventas y los sobrantes como ajustes de auditoría.
-- =============================================================================
create or replace function api_register_count(
  p_establishment_id uuid,
  p_campaign_id      uuid,
  p_lines            jsonb,
  p_occurred_on      date default current_date,
  p_notes            text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_count_id uuid;
  v_line jsonb;
  v_number_id uuid;
  v_counted integer;
  v_expected integer;
  v_diff integer;
begin
  perform app_assert_establishment_access(p_establishment_id);

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'El recuento debe incluir al menos un número.' using errcode = 'check_violation';
  end if;

  -- Movimiento de auditoría del recuento (sin efectos contables).
  v_count_id := app_new_movement(
    p_campaign_id      => p_campaign_id,
    p_type             => 'count',
    p_occurred_on      => p_occurred_on,
    p_establishment_id => p_establishment_id,
    p_concept          => 'Recuento de lotería',
    p_notes            => p_notes,
    p_group_id         => v_group
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_number_id := (v_line ->> 'lottery_number_id')::uuid;
    v_counted   := (v_line ->> 'counted_qty')::integer;

    if v_counted is null or v_counted < 0 then
      raise exception 'Las unidades contadas no pueden ser negativas.' using errcode = 'check_violation';
    end if;
    -- El recuento y las ventas que genere deben quedar en la misma campaña.
    if not exists (
      select 1 from lottery_numbers
      where id = v_number_id and campaign_id = p_campaign_id
    ) then
      raise exception 'Ese número de lotería no pertenece a la campaña del recuento.'
        using errcode = 'check_violation';
    end if;

    perform app_lock_establishment(p_establishment_id, v_number_id);
    v_expected := app_establishment_stock(p_establishment_id, v_number_id);
    v_diff := v_counted - v_expected;

    insert into count_lines (count_movement_id, lottery_number_id, expected_qty, counted_qty, difference_qty)
    values (v_count_id, v_number_id, v_expected, v_counted, v_diff);

    if v_diff < 0 then
      -- Faltan décimos -> se han vendido desde el último recuento.
      perform app_register_sale(p_establishment_id, v_number_id, -v_diff,
                                p_occurred_on, 'Ventas detectadas en el recuento', v_group);
    elsif v_diff > 0 then
      -- Sobran décimos -> ajuste de auditoría explícito.
      perform app_new_movement(
        p_campaign_id         => p_campaign_id,
        p_type                => 'adjustment',
        p_occurred_on         => p_occurred_on,
        p_establishment_id    => p_establishment_id,
        p_lottery_number_id   => v_number_id,
        p_quantity            => v_diff,
        p_concept             => 'Sobrante detectado en el recuento',
        p_notes               => p_notes,
        p_group_id            => v_group,
        p_d_establishment_qty => v_diff,
        p_d_written_off_qty   => -v_diff
      );
    end if;
  end loop;

  return v_count_id;
end $$;

-- =============================================================================
-- 7. RETIRADA DE EFECTIVO
--    Solo se descuenta lo REALMENTE retirado: si hay diferencia, sigue pendiente.
-- =============================================================================
create or replace function api_withdraw(
  p_establishment_id uuid,
  p_campaign_id      uuid,
  p_amount_cents     integer,
  p_occurred_on      date default current_date,
  p_notes            text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_expected bigint;
begin
  perform app_assert_admin();

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe retirado debe ser mayor que 0 €.' using errcode = 'check_violation';
  end if;

  -- El bloqueo garantiza que el importe esperado que se guarda corresponde
  -- exactamente al estado de la caja en el momento de registrar la retirada.
  perform app_lock_cash(p_establishment_id);
  v_expected := app_pending_cents(p_establishment_id, p_campaign_id);

  -- Se permite a propósito retirar más de lo esperado (la caja quedaría a favor
  -- del establecimiento y se ve en rojo). Lo que nunca se hace es ajustar la
  -- diferencia en silencio: se guarda lo esperado y lo realmente retirado.
  return app_new_movement(
    p_campaign_id           => p_campaign_id,
    p_type                  => 'withdrawal',
    p_occurred_on           => p_occurred_on,
    p_establishment_id      => p_establishment_id,
    p_amount_cents          => p_amount_cents,
    p_expected_amount_cents => v_expected::integer,
    p_concept               => 'Retirada de efectivo',
    p_notes                 => p_notes,
    p_d_pending_cents       => -p_amount_cents,
    p_d_central_cash_cents  => p_amount_cents
  );
end $$;

-- =============================================================================
-- 8. GASTO DEL FONDO FIESTA
-- =============================================================================
create or replace function api_fund_expense(
  p_campaign_id  uuid,
  p_concept      text,
  p_amount_cents integer,
  p_occurred_on  date default current_date,
  p_notes        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_admin();
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe del gasto debe ser mayor que 0 €.' using errcode = 'check_violation';
  end if;
  if p_concept is null or length(btrim(p_concept)) = 0 then
    raise exception 'Indica un concepto para el gasto.' using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id          => p_campaign_id,
    p_type                 => 'fund_expense',
    p_occurred_on          => p_occurred_on,
    p_amount_cents         => p_amount_cents,
    p_concept              => p_concept,
    p_notes                => p_notes,
    p_d_fund_expense_cents => p_amount_cents,
    p_d_central_cash_cents => -p_amount_cents
  );
end $$;

-- =============================================================================
-- 9. AJUSTE / BAJA DE INVENTARIO (siempre con motivo)
-- =============================================================================
create or replace function api_adjust_stock(
  p_lottery_number_id uuid,
  p_establishment_id  uuid,      -- null = almacén central
  p_delta_qty         integer,   -- negativo = baja, positivo = alta
  p_reason            text,
  p_occurred_on       date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_available integer;
begin
  perform app_assert_admin();

  if p_delta_qty is null or p_delta_qty = 0 then
    raise exception 'El ajuste debe ser distinto de 0.' using errcode = 'check_violation';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Indica el motivo del ajuste.' using errcode = 'check_violation';
  end if;

  select campaign_id into v_campaign from lottery_numbers where id = p_lottery_number_id;
  if v_campaign is null then
    raise exception 'El número de lotería indicado no existe.' using errcode = 'no_data_found';
  end if;

  if p_establishment_id is null then
    perform app_lock_central(p_lottery_number_id);
    v_available := app_central_stock(p_lottery_number_id);
    if v_available + p_delta_qty < 0 then
      raise exception 'El ajuste dejaría el stock central en negativo (disponible: %).', v_available
        using errcode = 'check_violation';
    end if;
    return app_new_movement(
      p_campaign_id       => v_campaign,
      p_type              => 'adjustment',
      p_occurred_on       => p_occurred_on,
      p_lottery_number_id => p_lottery_number_id,
      p_quantity          => abs(p_delta_qty),
      p_concept           => p_reason,
      p_d_central_qty     => p_delta_qty,
      p_d_written_off_qty => -p_delta_qty
    );
  else
    perform app_lock_establishment(p_establishment_id, p_lottery_number_id);
    v_available := app_establishment_stock(p_establishment_id, p_lottery_number_id);
    if v_available + p_delta_qty < 0 then
      raise exception 'El ajuste dejaría el stock del establecimiento en negativo (disponible: %).', v_available
        using errcode = 'check_violation';
    end if;
    return app_new_movement(
      p_campaign_id         => v_campaign,
      p_type                => 'adjustment',
      p_occurred_on         => p_occurred_on,
      p_establishment_id    => p_establishment_id,
      p_lottery_number_id   => p_lottery_number_id,
      p_quantity            => abs(p_delta_qty),
      p_concept             => p_reason,
      p_d_establishment_qty => p_delta_qty,
      p_d_written_off_qty   => -p_delta_qty
    );
  end if;
end $$;

-- =============================================================================
-- 10. ANULAR MOVIMIENTO (nunca se borra: se crea el movimiento inverso)
--     Si el movimiento pertenece a una operación agrupada (compra de varios
--     números, recuento) se anula la operación completa para no dejarla a medias.
-- =============================================================================
create or replace function api_void_movement(
  p_movement_id uuid,
  p_reason      text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_src movements%rowtype;
  v_group uuid;
  v_count integer := 0;
  v_new_id uuid;
  v_stock integer;
begin
  perform app_assert_admin();

  select * into v_src from movements where id = p_movement_id;
  if v_src.id is null then
    raise exception 'El movimiento indicado no existe.' using errcode = 'no_data_found';
  end if;
  if v_src.reverses_movement_id is not null then
    raise exception 'No se puede anular un movimiento que ya es una anulación.'
      using errcode = 'check_violation';
  end if;
  if v_src.reversed_by_movement_id is not null then
    raise exception 'Este movimiento ya está anulado.' using errcode = 'check_violation';
  end if;

  v_group := v_src.group_id;

  for v_src in
    select * from movements m
    where (v_group is not null and m.group_id = v_group or v_group is null and m.id = p_movement_id)
      and m.reverses_movement_id is null
      and m.reversed_by_movement_id is null
    -- Todos los movimientos de un grupo se crean en la misma transacción, así
    -- que comparten `created_at`. Se ordena por la clave de los bloqueos para
    -- que dos anulaciones simultáneas no puedan interbloquearse.
    order by m.lottery_number_id nulls first, m.establishment_id nulls first, m.id
  loop
    if v_src.lottery_number_id is not null then
      perform app_lock_central(v_src.lottery_number_id);
      if v_src.establishment_id is not null then
        perform app_lock_establishment(v_src.establishment_id, v_src.lottery_number_id);
      end if;
    end if;

    v_new_id := app_new_movement(
      p_campaign_id          => v_src.campaign_id,
      p_type                 => v_src.type,
      p_occurred_on          => current_date,
      p_establishment_id     => v_src.establishment_id,
      p_lottery_number_id    => v_src.lottery_number_id,
      p_quantity             => v_src.quantity,
      p_unit_price_cents     => v_src.unit_price_cents,
      p_amount_cents         => -v_src.amount_cents,
      p_expected_amount_cents => v_src.expected_amount_cents,
      p_concept              => 'ANULACIÓN: ' || coalesce(v_src.concept, v_src.type::text),
      p_notes                => p_reason,
      p_group_id             => v_src.group_id,
      p_reverses             => v_src.id,
      p_d_purchased_qty      => -v_src.d_purchased_qty,
      p_d_central_qty        => -v_src.d_central_qty,
      p_d_establishment_qty  => -v_src.d_establishment_qty,
      p_d_sold_qty           => -v_src.d_sold_qty,
      p_d_written_off_qty    => -v_src.d_written_off_qty,
      p_d_pending_cents      => -v_src.d_pending_cents,
      p_d_central_cash_cents => -v_src.d_central_cash_cents,
      p_d_revenue_cents      => -v_src.d_revenue_cents,
      p_d_capital_cents      => -v_src.d_capital_cents,
      p_d_commission_cents   => -v_src.d_commission_cents,
      p_d_fund_expense_cents => -v_src.d_fund_expense_cents
    );

    -- Enlazar original -> anulación (única modificación permitida del libro mayor)
    perform set_config('app.allow_movement_link', 'on', true);
    update movements set reversed_by_movement_id = v_new_id where id = v_src.id;
    perform set_config('app.allow_movement_link', 'off', true);

    -- La anulación nunca puede dejar el inventario en negativo.
    if v_src.lottery_number_id is not null then
      v_stock := app_central_stock(v_src.lottery_number_id);
      if v_stock < 0 then
        raise exception 'No se puede anular: el almacén central quedaría con % décimos.', v_stock
          using errcode = 'check_violation';
      end if;
      if v_src.establishment_id is not null then
        v_stock := app_establishment_stock(v_src.establishment_id, v_src.lottery_number_id);
        if v_stock < 0 then
          raise exception 'No se puede anular: el establecimiento quedaría con % décimos.', v_stock
            using errcode = 'check_violation';
        end if;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- =============================================================================
-- 11. GUARDAR UNA CAMPAÑA
--     En una sola transacción, para que nunca pueda quedar el sistema sin
--     ninguna campaña activa si la escritura falla a mitad.
-- =============================================================================
create or replace function api_save_campaign(
  p_id                   uuid,
  p_name                 text,
  p_year                 integer,
  p_purchase_price_cents integer,
  p_sale_price_cents     integer,
  p_is_default           boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_default boolean := coalesce(p_is_default, false) or p_id is null;
  v_id uuid;
begin
  perform app_assert_admin();

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Indica el nombre de la campaña.' using errcode = 'check_violation';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'El año de la campaña no es válido.' using errcode = 'check_violation';
  end if;
  if p_purchase_price_cents is null or p_purchase_price_cents <= 0
     or p_sale_price_cents is null or p_sale_price_cents <= 0 then
    raise exception 'Los precios deben ser mayores que 0 €.' using errcode = 'check_violation';
  end if;
  if p_sale_price_cents < p_purchase_price_cents then
    raise exception 'El precio de venta no puede ser menor que el de compra.'
      using errcode = 'check_violation';
  end if;

  if v_default then
    -- Solo puede haber una campaña en uso.
    update campaigns set is_default = false where is_default and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into campaigns (name, year, purchase_price_cents, sale_price_cents, is_default)
    values (btrim(p_name), p_year, p_purchase_price_cents, p_sale_price_cents, v_default)
    returning id into v_id;
  else
    update campaigns set
      name                 = btrim(p_name),
      year                 = p_year,
      purchase_price_cents = p_purchase_price_cents,
      sale_price_cents     = p_sale_price_cents,
      is_default           = v_default
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'La campaña indicada no existe.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end $$;

-- =============================================================================
-- 12. PERMISOS DE UN USUARIO
--     Rol, acceso y establecimientos asignados, todo en la misma transacción:
--     un fallo a mitad no puede dejar a un responsable sin ningún bar asignado.
-- =============================================================================
create or replace function api_set_user_access(
  p_user_id           uuid,
  p_role              app_role,
  p_is_active         boolean,
  p_establishment_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_admin();

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'El usuario indicado no existe.' using errcode = 'no_data_found';
  end if;

  -- Nadie puede dejarse a sí mismo sin acceso de administrador.
  if p_user_id = app_current_user_id() and (p_role <> 'admin' or not p_is_active) then
    raise exception 'No puedes quitarte a ti mismo los permisos de administrador.'
      using errcode = 'check_violation';
  end if;

  update profiles set role = p_role, is_active = coalesce(p_is_active, true)
  where id = p_user_id;

  -- Las asignaciones solo se tocan para los responsables: un administrador ve
  -- todos los establecimientos, y así conserva las suyas si algún día se le
  -- vuelve a poner como responsable.
  if p_role = 'manager' then
    delete from user_establishments where user_id = p_user_id;
    insert into user_establishments (user_id, establishment_id)
    select p_user_id, unnest(coalesce(p_establishment_ids, '{}'))
    on conflict do nothing;
  end if;
end $$;

-- ------------------------------ Permisos -----------------------------------
do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'api\_%'
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
exception when undefined_object then null;
end $$;

-- ===========================================================================
-- Bloque: 20260101000300_rls.sql
-- ===========================================================================

-- =============================================================================
-- Row Level Security.
-- Los permisos se aplican en la BASE DE DATOS, no solo ocultando botones:
--  · ADMIN: lo ve y lo hace todo.
--  · RESPONSABLE (manager): solo ve SUS establecimientos. No ve caja central,
--    ni cifras de otros bares, ni puede tocar compras ni configuración.
-- Toda escritura del libro mayor pasa por las funciones api_* (SECURITY DEFINER),
-- por lo que no hay ninguna policy de INSERT/UPDATE/DELETE sobre `movements`.
-- =============================================================================

alter table profiles            enable row level security;
alter table user_establishments enable row level security;
alter table establishments      enable row level security;
alter table campaigns           enable row level security;
alter table lottery_numbers     enable row level security;
alter table movements           enable row level security;
alter table count_lines         enable row level security;

-- ------------------------------- profiles ----------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = app_current_user_id() or app_is_admin());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- -------------------------- user_establishments ----------------------------
drop policy if exists user_establishments_select on user_establishments;
create policy user_establishments_select on user_establishments for select to authenticated
  using (user_id = app_current_user_id() or app_is_admin());

drop policy if exists user_establishments_admin_all on user_establishments;
create policy user_establishments_admin_all on user_establishments for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- ----------------------------- establishments ------------------------------
-- Un responsable solo "ve" los establecimientos que tiene asignados.
drop policy if exists establishments_select on establishments;
create policy establishments_select on establishments for select to authenticated
  using (app_can_access_establishment(id));

drop policy if exists establishments_admin_all on establishments;
create policy establishments_admin_all on establishments for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- -------------------------------- campaigns --------------------------------
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated using (true);

drop policy if exists campaigns_admin_all on campaigns;
create policy campaigns_admin_all on campaigns for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- ----------------------------- lottery_numbers -----------------------------
drop policy if exists lottery_numbers_select on lottery_numbers;
create policy lottery_numbers_select on lottery_numbers for select to authenticated using (true);

drop policy if exists lottery_numbers_admin_all on lottery_numbers;
create policy lottery_numbers_admin_all on lottery_numbers for all to authenticated
  using (app_is_admin()) with check (app_is_admin());

-- -------------------------------- movements --------------------------------
-- SOLO lectura, y filtrada por establecimiento para los responsables.
-- Los movimientos sin establecimiento (compras, caja central, fondo fiesta)
-- son EXCLUSIVOS del administrador.
drop policy if exists movements_select on movements;
create policy movements_select on movements for select to authenticated
  using (
    app_is_admin()
    or (establishment_id is not null and app_can_access_establishment(establishment_id))
  );

-- ------------------------------- count_lines -------------------------------
drop policy if exists count_lines_select on count_lines;
create policy count_lines_select on count_lines for select to authenticated
  using (exists (
    select 1 from movements m
    where m.id = count_lines.count_movement_id
      and (app_is_admin() or (m.establishment_id is not null
                              and app_can_access_establishment(m.establishment_id)))
  ));

-- --------------------------- Permisos de tabla -----------------------------
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on profiles, user_establishments, establishments,
      campaigns, lottery_numbers to authenticated;   -- filtrado por las policies
revoke insert, update, delete on movements, count_lines from authenticated;

-- --------------------- Alta automática de perfil ---------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- El primer usuario que se registra es el administrador. El resto entran
    -- SIEMPRE como responsables: el rol nunca se toma de los metadatos del
    -- registro, para que nadie pueda darse permisos de admin al registrarse.
    case when (select count(*) from public.profiles) = 0 then 'admin'::app_role
         else 'manager'::app_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ===========================================================================
-- Bloque: 20260101000400_demo_seed_function.sql
-- ===========================================================================

-- =============================================================================
-- Generador de DATOS DEMO.
-- Se define aquí para que puedan usarlo tanto `supabase/seed.sql` como los
-- tests automáticos. NO se ejecuta sola: hay que llamarla explícitamente.
-- =============================================================================
create or replace function dev_seed_demo_data(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_huerta uuid; v_raspa uuid; v_rincon uuid; v_paco uuid; v_tracata uuid;
  v_n69588 uuid; v_n06004 uuid;
  v_today date := current_date;
begin
  if exists (select 1 from movements) then
    raise notice 'Ya existen movimientos: no se generan datos demo.';
    return;
  end if;

  -- El generador actúa en nombre del administrador indicado.
  perform set_config('app.acting_user', p_admin_id::text, false);

  -- ---------------------------- Campaña ------------------------------------
  insert into campaigns (name, year, purchase_price_cents, sale_price_cents, is_default)
  values ('Lotería de Navidad 2026', 2026, 2000, 2300, true)
  returning id into v_campaign;

  -- ------------------------ Establecimientos --------------------------------
  insert into establishments (name, manager_name, sort_order) values
    ('La Huerta',            'Marta',  1) returning id into v_huerta;
  insert into establishments (name, manager_name, sort_order) values
    ('Raspa',                'Jose',   2) returning id into v_raspa;
  insert into establishments (name, manager_name, sort_order) values
    ('El Rincón',            'Luis',   3) returning id into v_rincon;
  insert into establishments (name, manager_name, sort_order) values
    ('Casa Paco',            'Ana',    4) returning id into v_paco;
  insert into establishments (name, manager_name, sort_order) values
    ('Marisquería Tracatá',  'Sergio', 5) returning id into v_tracata;

  -- --------------- Aportación inicial a la caja central ---------------------
  perform api_capital_injection(v_campaign, 300000, v_today - 40,
    'Aportación inicial del proyecto', 'Dinero puesto para arrancar la campaña');

  -- ------------------------- Compra inicial ---------------------------------
  perform api_create_purchase(
    v_campaign,
    '[{"number": "69588", "quantity": 100}]'::jsonb,
    v_today - 39, 'Administración nº 4', 'Compra inicial de la campaña');

  select id into v_n69588 from lottery_numbers where campaign_id = v_campaign and number = '69588';

  -- ------------------ Entregas a los establecimientos -----------------------
  perform api_deliver(v_huerta,  v_n69588, 30, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_raspa,   v_n69588, 25, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_rincon,  v_n69588, 20, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_paco,    v_n69588, 15, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_tracata, v_n69588, 10, v_today - 38, 'Reparto inicial');

  -- ------------------------------ Ventas ------------------------------------
  perform api_sale(v_huerta,  v_n69588, 7, v_today - 30, null);
  perform api_sale(v_huerta,  v_n69588, 5, v_today - 20, null);
  perform api_sale(v_raspa,   v_n69588, 10, v_today - 22, null);
  perform api_sale(v_rincon,  v_n69588, 7, v_today - 18, null);
  perform api_sale(v_paco,    v_n69588, 4, v_today - 15, null);
  perform api_sale(v_tracata, v_n69588, 3, v_today - 12, null);

  -- -------------------- Retirada COMPLETA (La Huerta) -----------------------
  -- 12 décimos vendidos x 23 € = 276 € -> queda a 0.
  perform api_withdraw(v_huerta, v_campaign, 27600, v_today - 10, 'Liquidación completa');

  -- --------------------- Retirada PARCIAL (Raspa) ---------------------------
  -- Esperado 230 €, se retiran 220 € -> quedan 10 € pendientes (no se borran).
  perform api_withdraw(v_raspa, v_campaign, 22000, v_today - 9, 'Faltaban 10 € en la caja');

  -- --------------------- Devolución al almacén central ----------------------
  perform api_return(v_tracata, v_n69588, 4, v_today - 8, 'Sobran décimos, se devuelven');

  -- ------------------- Recuento físico en El Rincón -------------------------
  -- La app esperaba 13 décimos y quedan 11 -> se registran 2 ventas.
  perform api_register_count(
    v_rincon, v_campaign,
    jsonb_build_array(jsonb_build_object('lottery_number_id', v_n69588, 'counted_qty', 11)),
    v_today - 5, 'Arqueo mensual');

  -- --------------------------- Segunda compra -------------------------------
  -- No borra ni altera el histórico de la primera.
  perform api_create_purchase(
    v_campaign,
    '[{"number": "06004", "quantity": 50}]'::jsonb,
    v_today - 4, 'Administración nº 4', 'Segunda compra con el dinero retirado');

  select id into v_n06004 from lottery_numbers where campaign_id = v_campaign and number = '06004';
  perform api_deliver(v_huerta, v_n06004, 20, v_today - 3, 'Reparto del número nuevo');

  -- ---------------------- Gasto del fondo fiesta ----------------------------
  perform api_fund_expense(v_campaign, 'Adelanto decoración fiesta', 5000, v_today - 2, null);

  perform set_config('app.acting_user', '', false);
end $$;

comment on function dev_seed_demo_data(uuid) is
  'Genera el escenario de prueba completo (compra, entregas, ventas, retirada '
  'completa, retirada parcial, devolución, recuento y segunda compra).';
