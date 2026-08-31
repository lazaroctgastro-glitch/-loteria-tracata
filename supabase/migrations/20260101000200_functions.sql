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
  select email into v_email from profiles where id = v_user;

  insert into movements (
    campaign_id, type, occurred_on, created_by, created_by_email,
    establishment_id, lottery_number_id, quantity, unit_price_cents, amount_cents,
    concept, notes, supplier, group_id, reverses_movement_id,
    d_purchased_qty, d_central_qty, d_establishment_qty, d_sold_qty, d_written_off_qty,
    d_pending_cents, d_central_cash_cents, d_revenue_cents, d_capital_cents,
    d_commission_cents, d_fund_expense_cents
  ) values (
    p_campaign_id, p_type, coalesce(p_occurred_on, current_date), v_user, v_email,
    p_establishment_id, p_lottery_number_id, p_quantity, p_unit_price_cents, p_amount_cents,
    p_concept, p_notes, p_supplier, p_group_id, p_reverses,
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

  perform app_lock_cash(p_establishment_id);
  v_expected := app_pending_cents(p_establishment_id, p_campaign_id);

  return app_new_movement(
    p_campaign_id          => p_campaign_id,
    p_type                 => 'withdrawal',
    p_occurred_on          => p_occurred_on,
    p_establishment_id     => p_establishment_id,
    p_amount_cents         => p_amount_cents,
    p_concept              => 'Retirada de efectivo',
    p_notes                => p_notes,
    p_d_pending_cents      => -p_amount_cents,
    p_d_central_cash_cents => p_amount_cents
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
    order by m.created_at desc, m.id desc
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
