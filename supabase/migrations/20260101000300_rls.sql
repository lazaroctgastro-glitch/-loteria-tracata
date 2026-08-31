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
