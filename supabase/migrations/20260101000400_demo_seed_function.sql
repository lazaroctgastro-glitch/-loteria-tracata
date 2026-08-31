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
