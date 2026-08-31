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
