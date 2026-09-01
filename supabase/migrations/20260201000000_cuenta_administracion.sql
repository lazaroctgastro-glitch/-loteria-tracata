-- =============================================================================
-- CUENTA CORRIENTE CON LA ADMINISTRACIÓN DE LOTERÍA
--
-- Hasta ahora la compra de lotería descontaba el importe de la caja central en
-- el mismo momento, es decir, daba por hecho que siempre se pagaba al contado.
-- El negocio real funciona a crédito: retiramos décimos y vamos pagando aparte.
--
-- Esta migración separa CUATRO dimensiones que antes estaban mezcladas:
--     STOCK  ≠  VENTAS  ≠  DINERO FÍSICO  ≠  DEUDA
--
-- Es ADITIVA: no borra ni reescribe ningún movimiento existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. La deuda con la administración es un delta más del libro mayor
-- ---------------------------------------------------------------------------
alter table movements
  add column if not exists d_supplier_debt_cents integer not null default 0;

comment on column movements.d_supplier_debt_cents is
  'Variación de la deuda con la administración de lotería. Sube al retirar '
  'décimos sin pagar y baja al pagar o al devolver décimos.';

create index if not exists movements_supplier_debt_idx
  on movements (campaign_id, created_at)
  where d_supplier_debt_cents <> 0;

-- ---------------------------------------------------------------------------
-- 2. Tipos de movimiento nuevos
--
-- Nota técnica: PostgreSQL no permite USAR un valor de enum recién añadido
-- dentro de la misma transacción en la que se añade. Como el instalador se
-- ejecuta de una sola vez, las vistas de más abajo comparan `type::text` en
-- lugar del enum para estos valores nuevos.
-- ---------------------------------------------------------------------------
alter type movement_type add value if not exists 'supplier_payment';  -- pago a la administración
alter type movement_type add value if not exists 'supplier_return';   -- devolución a la administración
alter type movement_type add value if not exists 'opening_balance';   -- saldo inicial / regularización
alter type movement_type add value if not exists 'cash_adjustment';   -- ajuste explícito de dinero

-- ---------------------------------------------------------------------------
-- 2 bis. El insertor de movimientos aprende a mover la deuda
--
-- Se elimina primero la versión anterior: añadir un parámetro crea una función
-- distinta (una sobrecarga), y con dos versiones convivendo las llamadas por
-- nombre de parámetro quedarían ambiguas.
-- ---------------------------------------------------------------------------
drop function if exists app_new_movement(
  uuid, movement_type, date, uuid, uuid, integer, integer, integer, integer,
  text, text, text, uuid, uuid, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer);

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
  p_d_fund_expense_cents  integer      default 0,
  p_d_supplier_debt_cents integer      default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_user uuid := app_current_user_id();
  v_email text;
begin
  -- Un movimiento nunca puede apuntar a un número de otra campaña.
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
    d_commission_cents, d_fund_expense_cents, d_supplier_debt_cents
  ) values (
    p_campaign_id, p_type, coalesce(p_occurred_on, current_date), v_user, v_email,
    p_establishment_id, p_lottery_number_id, p_quantity, p_unit_price_cents, p_amount_cents,
    p_expected_amount_cents, p_concept, p_notes, p_supplier, p_group_id, p_reverses,
    p_d_purchased_qty, p_d_central_qty, p_d_establishment_qty, p_d_sold_qty, p_d_written_off_qty,
    p_d_pending_cents, p_d_central_cash_cents, p_d_revenue_cents, p_d_capital_cents,
    p_d_commission_cents, p_d_fund_expense_cents, p_d_supplier_debt_cents
  ) returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Retirar lotería de la administración
--
--    El stock entra SIEMPRE, esté pagado o no. Lo que no se paga en el momento
--    se convierte en deuda. Si se paga algo, se registra como un pago aparte
--    dentro de la misma operación, para que la cuenta corriente muestre su
--    línea de cargo y su línea de pago.
-- ---------------------------------------------------------------------------
drop function if exists api_create_purchase(uuid, jsonb, date, text, text);

create or replace function api_create_purchase(
  p_campaign_id      uuid,
  p_lines            jsonb,
  p_occurred_on      date default current_date,
  p_supplier         text default null,
  p_notes            text default null,
  p_paid_amount_cents integer default 0
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
  v_total bigint := 0;
  v_paid integer := coalesce(p_paid_amount_cents, 0);
begin
  perform app_assert_admin();

  select purchase_price_cents into v_default_price from campaigns where id = p_campaign_id;
  if v_default_price is null then
    raise exception 'La campaña indicada no existe.' using errcode = 'no_data_found';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debes indicar al menos un número de lotería.' using errcode = 'check_violation';
  end if;
  if v_paid < 0 then
    raise exception 'El importe pagado no puede ser negativo.' using errcode = 'check_violation';
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

    -- Retirar más décimos de un número que ya teníamos SUMA stock.
    insert into lottery_numbers (campaign_id, number)
    values (p_campaign_id, v_number)
    on conflict (campaign_id, number) do nothing;

    select id into v_number_id from lottery_numbers
    where campaign_id = p_campaign_id and number = v_number;

    v_total := v_total + (v_qty::bigint * v_price);

    perform app_new_movement(
      p_campaign_id           => p_campaign_id,
      p_type                  => 'purchase',
      p_occurred_on           => p_occurred_on,
      p_lottery_number_id     => v_number_id,
      p_quantity              => v_qty,
      p_unit_price_cents      => v_price,
      p_amount_cents          => v_qty * v_price,
      p_notes                 => p_notes,
      p_supplier              => p_supplier,
      p_group_id              => v_group,
      p_d_purchased_qty       => v_qty,
      p_d_central_qty         => v_qty,
      -- El stock entra aunque no se haya pagado: lo no pagado queda a deber.
      p_d_supplier_debt_cents => v_qty * v_price
    );
  end loop;

  if v_paid > v_total then
    raise exception 'No puedes pagar % € por una retirada de % €. Si quieres adelantar dinero, usa "Pagar a la administración".',
      round(v_paid / 100.0, 2), round(v_total / 100.0, 2) using errcode = 'check_violation';
  end if;

  -- Lo pagado en el momento se apunta como pago, no como parte de la retirada.
  if v_paid > 0 then
    perform app_pay_supplier(p_campaign_id, v_paid, p_occurred_on,
                             'Pago al retirar la lotería', p_notes, v_group);
  end if;

  return v_group;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Pagar a la administración
-- ---------------------------------------------------------------------------
create or replace function app_pay_supplier(
  p_campaign_id  uuid,
  p_amount_cents integer,
  p_occurred_on  date,
  p_concept      text,
  p_notes        text,
  p_group_id     uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe del pago debe ser mayor que 0 €.' using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id           => p_campaign_id,
    p_type                  => 'supplier_payment',
    p_occurred_on           => p_occurred_on,
    p_amount_cents          => p_amount_cents,
    p_concept               => coalesce(p_concept, 'Pago a la administración'),
    p_notes                 => p_notes,
    p_group_id              => p_group_id,
    -- Sale dinero real de la caja y baja lo que debemos.
    p_d_central_cash_cents  => -p_amount_cents,
    p_d_supplier_debt_cents => -p_amount_cents
  );
end $$;

create or replace function api_pay_supplier(
  p_campaign_id  uuid,
  p_amount_cents integer,
  p_occurred_on  date default current_date,
  p_method       text default null,
  p_notes        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_admin();
  return app_pay_supplier(
    p_campaign_id, p_amount_cents, coalesce(p_occurred_on, current_date),
    case when p_method is null or btrim(p_method) = '' then 'Pago a la administración'
         else 'Pago a la administración (' || btrim(p_method) || ')' end,
    p_notes, null);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Devolver décimos a la administración
--    Salen del almacén y reducen lo que debemos por ellos.
-- ---------------------------------------------------------------------------
create or replace function api_return_to_supplier(
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
  v_price integer;
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

  select purchase_price_cents into v_price from campaigns where id = v_campaign;

  perform app_lock_central(p_lottery_number_id);
  v_available := app_central_stock(p_lottery_number_id);

  if p_quantity > v_available then
    raise exception 'En el almacén solo quedan % décimos del número %. No puedes devolver %.',
      v_available, v_number, p_quantity using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id           => v_campaign,
    p_type                  => 'supplier_return',
    p_occurred_on           => p_occurred_on,
    p_lottery_number_id     => p_lottery_number_id,
    p_quantity              => p_quantity,
    p_unit_price_cents      => v_price,
    p_amount_cents          => p_quantity * v_price,
    p_concept               => 'Devolución a la administración',
    p_notes                 => p_notes,
    p_d_purchased_qty       => -p_quantity,
    p_d_central_qty         => -p_quantity,
    p_d_supplier_debt_cents => -(p_quantity * v_price)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. Las anulaciones también deshacen la deuda
-- ---------------------------------------------------------------------------
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
    order by m.lottery_number_id nulls first, m.establishment_id nulls first, m.id
  loop
    if v_src.lottery_number_id is not null then
      perform app_lock_central(v_src.lottery_number_id);
      if v_src.establishment_id is not null then
        perform app_lock_establishment(v_src.establishment_id, v_src.lottery_number_id);
      end if;
    end if;

    v_new_id := app_new_movement(
      p_campaign_id           => v_src.campaign_id,
      p_type                  => v_src.type,
      p_occurred_on           => current_date,
      p_establishment_id      => v_src.establishment_id,
      p_lottery_number_id     => v_src.lottery_number_id,
      p_quantity              => v_src.quantity,
      p_unit_price_cents      => v_src.unit_price_cents,
      p_amount_cents          => -v_src.amount_cents,
      p_expected_amount_cents => v_src.expected_amount_cents,
      p_concept               => 'ANULACIÓN: ' || coalesce(v_src.concept, v_src.type::text),
      p_notes                 => p_reason,
      p_group_id              => v_src.group_id,
      p_reverses              => v_src.id,
      p_d_purchased_qty       => -v_src.d_purchased_qty,
      p_d_central_qty         => -v_src.d_central_qty,
      p_d_establishment_qty   => -v_src.d_establishment_qty,
      p_d_sold_qty            => -v_src.d_sold_qty,
      p_d_written_off_qty     => -v_src.d_written_off_qty,
      p_d_pending_cents       => -v_src.d_pending_cents,
      p_d_central_cash_cents  => -v_src.d_central_cash_cents,
      p_d_revenue_cents       => -v_src.d_revenue_cents,
      p_d_capital_cents       => -v_src.d_capital_cents,
      p_d_commission_cents    => -v_src.d_commission_cents,
      p_d_fund_expense_cents  => -v_src.d_fund_expense_cents,
      p_d_supplier_debt_cents => -v_src.d_supplier_debt_cents
    );

    perform set_config('app.allow_movement_link', 'on', true);
    update movements set reversed_by_movement_id = v_new_id where id = v_src.id;
    perform set_config('app.allow_movement_link', 'off', true);

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

-- ---------------------------------------------------------------------------
-- 7. Retirar dinero de un bar: no se puede recoger más de lo pendiente
-- ---------------------------------------------------------------------------
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

  -- El bloqueo garantiza que lo esperado que se guarda corresponde al estado
  -- real de la caja en el momento de registrar la retirada.
  perform app_lock_cash(p_establishment_id);
  v_expected := app_pending_cents(p_establishment_id, p_campaign_id);

  -- Se puede recoger MENOS de lo esperado: la diferencia sigue pendiente y no
  -- se borra nunca. Recoger MÁS no tiene sentido contable, así que se bloquea
  -- y se ofrece el ajuste explícito, que deja constancia del motivo.
  if p_amount_cents > v_expected then
    raise exception 'En este establecimiento solo hay % € pendientes de recoger y estás registrando %€. Si el descuadre es real, usa "Corregir la caja del bar" indicando el motivo.',
      round(v_expected / 100.0, 2), round(p_amount_cents / 100.0, 2)
      using errcode = 'check_violation';
  end if;

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

-- ---------------------------------------------------------------------------
-- 8. Corregir la caja pendiente de un bar (siempre con motivo)
-- ---------------------------------------------------------------------------
create or replace function api_adjust_establishment_cash(
  p_establishment_id uuid,
  p_campaign_id      uuid,
  p_delta_cents      integer,
  p_reason           text,
  p_occurred_on      date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_assert_admin();

  if p_delta_cents is null or p_delta_cents = 0 then
    raise exception 'El ajuste debe ser distinto de 0 €.' using errcode = 'check_violation';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Indica el motivo del ajuste.' using errcode = 'check_violation';
  end if;

  return app_new_movement(
    p_campaign_id      => p_campaign_id,
    p_type             => 'cash_adjustment',
    p_occurred_on      => p_occurred_on,
    p_establishment_id => p_establishment_id,
    p_amount_cents     => abs(p_delta_cents),
    p_concept          => btrim(p_reason),
    p_d_pending_cents  => p_delta_cents
  );
end $$;

-- ---------------------------------------------------------------------------
-- 9. Saldos iniciales / regularización
--
--    Para arrancar con la situación real cuando ya se venía trabajando en
--    papel. Queda registrado como movimiento, con su fecha y su usuario, para
--    no perder la trazabilidad. Cada saldo solo se puede fijar una vez.
-- ---------------------------------------------------------------------------
create or replace function api_set_opening_balances(
  p_campaign_id            uuid,
  p_supplier_debt_cents    integer default null,
  p_central_cash_cents     integer default null,
  p_establishment_pending  jsonb   default '[]',
  p_occurred_on            date    default current_date,
  p_notes                  text    default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_line jsonb;
  v_establishment uuid;
  v_amount integer;
begin
  perform app_assert_admin();

  if exists (
    select 1 from movements
    where campaign_id = p_campaign_id and type::text = 'opening_balance'
      and reverses_movement_id is null and reversed_by_movement_id is null
  ) then
    raise exception 'Los saldos iniciales de esta campaña ya se registraron. Anúlalos desde Movimientos si necesitas rehacerlos.'
      using errcode = 'check_violation';
  end if;

  if coalesce(p_supplier_debt_cents, 0) <> 0 then
    if p_supplier_debt_cents < 0 then
      raise exception 'La deuda inicial no puede ser negativa.' using errcode = 'check_violation';
    end if;
    perform app_new_movement(
      p_campaign_id           => p_campaign_id,
      p_type                  => 'opening_balance',
      p_occurred_on           => p_occurred_on,
      p_amount_cents          => p_supplier_debt_cents,
      p_concept               => 'Saldo inicial: deuda con la administración',
      p_notes                 => p_notes,
      p_d_supplier_debt_cents => p_supplier_debt_cents
    );
    v_count := v_count + 1;
  end if;

  if coalesce(p_central_cash_cents, 0) <> 0 then
    perform app_new_movement(
      p_campaign_id          => p_campaign_id,
      p_type                 => 'opening_balance',
      p_occurred_on          => p_occurred_on,
      p_amount_cents         => abs(p_central_cash_cents),
      p_concept              => 'Saldo inicial: dinero en la caja central',
      p_notes                => p_notes,
      p_d_central_cash_cents => p_central_cash_cents
    );
    v_count := v_count + 1;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_establishment_pending, '[]'::jsonb)) loop
    v_establishment := (v_line ->> 'establishment_id')::uuid;
    v_amount := (v_line ->> 'amount_cents')::integer;
    continue when coalesce(v_amount, 0) = 0;

    perform app_new_movement(
      p_campaign_id      => p_campaign_id,
      p_type             => 'opening_balance',
      p_occurred_on      => p_occurred_on,
      p_establishment_id => v_establishment,
      p_amount_cents     => abs(v_amount),
      p_concept          => 'Saldo inicial: dinero pendiente en el establecimiento',
      p_notes            => p_notes,
      p_d_pending_cents  => v_amount
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Cuenta corriente con la administración
--     Fecha | Concepto | Cargo | Pago | Saldo acumulado
-- ---------------------------------------------------------------------------
create or replace view v_supplier_account
with (security_invoker = true) as
select
  m.id,
  m.campaign_id,
  m.occurred_on,
  m.created_at,
  m.type,
  coalesce(m.concept,
    case when m.d_supplier_debt_cents > 0 then 'Retirada de lotería'
         else 'Pago a la administración' end)                    as concept,
  m.quantity,
  ln.number                                                      as lottery_number,
  m.notes,
  m.created_by_email,
  (m.reversed_by_movement_id is not null)                        as is_reversed,
  greatest(m.d_supplier_debt_cents, 0)::bigint                   as charge_cents,
  greatest(-m.d_supplier_debt_cents, 0)::bigint                  as payment_cents,
  sum(m.d_supplier_debt_cents) over (
    partition by m.campaign_id
    order by m.occurred_on, m.created_at, m.id
    rows between unbounded preceding and current row
  )::bigint                                                      as balance_cents
from movements m
left join lottery_numbers ln on ln.id = m.lottery_number_id
where m.d_supplier_debt_cents <> 0;

-- ---------------------------------------------------------------------------
-- 11. Resumen de campaña con las cuatro dimensiones separadas
--
--     STOCK  ≠  VENTAS  ≠  DINERO FÍSICO  ≠  DEUDA
--
--     `central_cash_cents` es DINERO REAL: solo cambia cuando el dinero entra
--     o sale físicamente de la caja. Vender NO aumenta la caja central.
-- ---------------------------------------------------------------------------
drop view if exists v_campaign_summary cascade;
create view v_campaign_summary
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
  -- Valor de la lotería retirada de la administración (esté pagada o no).
  coalesce(sum(m.amount_cents) filter (where m.type = 'purchase'), 0)::bigint          as purchases_cost_cents,
  coalesce(sum(m.d_central_cash_cents) filter (where m.type = 'capital_injection'), 0)::bigint as injected_cents,
  coalesce(sum(m.d_fund_expense_cents), 0)::bigint                   as fund_expenses_cents,
  coalesce(sum(m.d_commission_cents) - sum(m.d_fund_expense_cents), 0)::bigint as fund_balance_cents,
  -- DINERO REAL en la caja central.
  coalesce(sum(m.d_central_cash_cents), 0)::bigint                   as central_cash_cents,
  -- Lo que debemos a la administración.
  coalesce(sum(m.d_supplier_debt_cents), 0)::bigint                  as supplier_debt_cents,
  -- Dinero que ha salido de la caja hacia la administración. Se cuentan también
  -- las compras antiguas, que descontaban la caja directamente al comprar.
  coalesce(-sum(m.d_central_cash_cents) filter (
    where m.type::text = 'supplier_payment' or m.type = 'purchase'), 0)::bigint as supplier_paid_cents,
  -- Valor a precio de coste de los décimos que quedan sin vender.
  (coalesce(sum(m.d_central_qty) + sum(m.d_establishment_qty), 0) * c.purchase_price_cents)::bigint
                                                                     as stock_value_cents,
  -- Posición de la campaña (informativo, NO es dinero disponible):
  -- caja + pendiente en bares + valor del stock - deuda.
  (coalesce(sum(m.d_central_cash_cents), 0)
   + coalesce(sum(m.d_pending_cents), 0)
   + coalesce(sum(m.d_central_qty) + sum(m.d_establishment_qty), 0) * c.purchase_price_cents
   - coalesce(sum(m.d_supplier_debt_cents), 0))::bigint              as position_cents
from campaigns c
left join movements m on m.campaign_id = c.id
group by c.id, c.name, c.year, c.purchase_price_cents, c.sale_price_cents;

-- ---------------------------------------------------------------------------
-- 12. El control de integridad vigila también la deuda y la caja
-- ---------------------------------------------------------------------------
drop view if exists v_integrity_check cascade;
create view v_integrity_check
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

grant select on all tables in schema public to authenticated;

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
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 13. Datos demo actualizados al funcionamiento real (a crédito)
-- ---------------------------------------------------------------------------
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

  perform set_config('app.acting_user', p_admin_id::text, false);

  insert into campaigns (name, year, purchase_price_cents, sale_price_cents, is_default)
  values ('Lotería de Navidad 2026', 2026, 2000, 2300, true)
  returning id into v_campaign;

  insert into establishments (name, manager_name, sort_order) values
    ('La Huerta', 'Marta', 1) returning id into v_huerta;
  insert into establishments (name, manager_name, sort_order) values
    ('Raspa', 'Jose', 2) returning id into v_raspa;
  insert into establishments (name, manager_name, sort_order) values
    ('El Rincón', 'Luis', 3) returning id into v_rincon;
  insert into establishments (name, manager_name, sort_order) values
    ('Casa Paco', 'Ana', 4) returning id into v_paco;
  insert into establishments (name, manager_name, sort_order) values
    ('Marisquería Tracatá', 'Sergio', 5) returning id into v_tracata;

  -- Retirada de la administración SIN pagar: el stock entra y queda a deber.
  perform api_create_purchase(
    v_campaign, '[{"number": "69588", "quantity": 100}]'::jsonb,
    v_today - 39, 'Administración nº 4', 'Primera retirada, a deber', 0);

  select id into v_n69588 from lottery_numbers where campaign_id = v_campaign and number = '69588';

  perform api_deliver(v_huerta,  v_n69588, 30, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_raspa,   v_n69588, 25, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_rincon,  v_n69588, 20, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_paco,    v_n69588, 15, v_today - 38, 'Reparto inicial');
  perform api_deliver(v_tracata, v_n69588, 10, v_today - 38, 'Reparto inicial');

  perform api_sale(v_huerta,  v_n69588, 7,  v_today - 30, null);
  perform api_sale(v_huerta,  v_n69588, 5,  v_today - 20, null);
  perform api_sale(v_raspa,   v_n69588, 10, v_today - 22, null);
  perform api_sale(v_rincon,  v_n69588, 7,  v_today - 18, null);
  perform api_sale(v_paco,    v_n69588, 4,  v_today - 15, null);
  perform api_sale(v_tracata, v_n69588, 3,  v_today - 12, null);

  -- Recogida COMPLETA en La Huerta: 12 décimos x 23 € = 276 €.
  perform api_withdraw(v_huerta, v_campaign, 27600, v_today - 10, 'Liquidación completa');
  -- Recogida PARCIAL en Raspa: esperados 230 €, se recogen 220 €.
  perform api_withdraw(v_raspa, v_campaign, 22000, v_today - 9, 'Faltaban 10 € en la caja');

  perform api_return(v_tracata, v_n69588, 4, v_today - 8, 'Sobran décimos, vuelven al almacén');

  -- Recuento: la app esperaba 13 décimos y quedan 11 -> 2 ventas.
  perform api_register_count(
    v_rincon, v_campaign,
    jsonb_build_array(jsonb_build_object('lottery_number_id', v_n69588, 'counted_qty', 11)),
    v_today - 5, 'Arqueo mensual');

  -- Segunda retirada, pagando 100 € en el momento y dejando 900 € a deber.
  perform api_create_purchase(
    v_campaign, '[{"number": "06004", "quantity": 50}]'::jsonb,
    v_today - 4, 'Administración nº 4', 'Segunda retirada', 10000);

  select id into v_n06004 from lottery_numbers where campaign_id = v_campaign and number = '06004';
  perform api_deliver(v_huerta, v_n06004, 20, v_today - 3, 'Reparto del número nuevo');

  -- Pago a cuenta con parte del dinero recogido en los bares.
  perform api_pay_supplier(v_campaign, 20000, v_today - 2, 'Efectivo', 'Pago a cuenta');

  perform api_fund_expense(v_campaign, 'Adelanto decoración fiesta', 5000, v_today - 2, null);

  perform set_config('app.acting_user', '', false);
end $$;

-- ---------------------------------------------------------------------------
-- 14. Regularización: se indica el saldo REAL, no la diferencia
--
--     Quien ya venía trabajando (en papel o con la versión anterior) no sabe
--     qué diferencia hay que apuntar: sabe cuánto debe y cuánto tiene. Esta
--     función lee lo que consta ahora y registra solo el ajuste necesario para
--     llegar al valor real, dejándolo en el histórico.
-- ---------------------------------------------------------------------------
create or replace function api_set_opening_balances(
  p_campaign_id            uuid,
  p_supplier_debt_cents    integer default null,
  p_central_cash_cents     integer default null,
  p_establishment_pending  jsonb   default '[]',
  p_occurred_on            date    default current_date,
  p_notes                  text    default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_line jsonb;
  v_establishment uuid;
  v_target integer;
  v_current bigint;
  v_delta bigint;
begin
  perform app_assert_admin();

  if exists (
    select 1 from movements
    where campaign_id = p_campaign_id and type::text = 'opening_balance'
      and reverses_movement_id is null and reversed_by_movement_id is null
  ) then
    raise exception 'Los saldos de esta campaña ya se regularizaron una vez. Anúlalos desde Movimientos si necesitas rehacerlos.'
      using errcode = 'check_violation';
  end if;

  -- Deuda con la administración
  if p_supplier_debt_cents is not null then
    if p_supplier_debt_cents < 0 then
      raise exception 'La deuda no puede ser negativa.' using errcode = 'check_violation';
    end if;
    select coalesce(sum(d_supplier_debt_cents), 0) into v_current
    from movements where campaign_id = p_campaign_id;
    v_delta := p_supplier_debt_cents - v_current;
    if v_delta <> 0 then
      perform app_new_movement(
        p_campaign_id           => p_campaign_id,
        p_type                  => 'opening_balance',
        p_occurred_on           => p_occurred_on,
        p_amount_cents          => abs(v_delta)::integer,
        p_concept               => 'Saldo real: deuda con la administración',
        p_notes                 => p_notes,
        p_d_supplier_debt_cents => v_delta::integer
      );
      v_count := v_count + 1;
    end if;
  end if;

  -- Dinero en la caja central
  if p_central_cash_cents is not null then
    select coalesce(sum(d_central_cash_cents), 0) into v_current
    from movements where campaign_id = p_campaign_id;
    v_delta := p_central_cash_cents - v_current;
    if v_delta <> 0 then
      perform app_new_movement(
        p_campaign_id          => p_campaign_id,
        p_type                 => 'opening_balance',
        p_occurred_on          => p_occurred_on,
        p_amount_cents         => abs(v_delta)::integer,
        p_concept              => 'Saldo real: dinero en la caja central',
        p_notes                => p_notes,
        p_d_central_cash_cents => v_delta::integer
      );
      v_count := v_count + 1;
    end if;
  end if;

  -- Dinero pendiente en cada establecimiento
  for v_line in select * from jsonb_array_elements(coalesce(p_establishment_pending, '[]'::jsonb)) loop
    v_establishment := (v_line ->> 'establishment_id')::uuid;
    v_target := (v_line ->> 'amount_cents')::integer;
    continue when v_target is null;

    perform app_lock_cash(v_establishment);
    v_current := app_pending_cents(v_establishment, p_campaign_id);
    v_delta := v_target - v_current;
    continue when v_delta = 0;

    perform app_new_movement(
      p_campaign_id      => p_campaign_id,
      p_type             => 'opening_balance',
      p_occurred_on      => p_occurred_on,
      p_establishment_id => v_establishment,
      p_amount_cents     => abs(v_delta)::integer,
      p_concept          => 'Saldo real: dinero pendiente en el establecimiento',
      p_notes            => p_notes,
      p_d_pending_cents  => v_delta::integer
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

notify pgrst, 'reload schema';
