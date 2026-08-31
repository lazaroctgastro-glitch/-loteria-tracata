-- =============================================================================
-- SEED de desarrollo (se ejecuta con `supabase db reset`).
-- Crea los usuarios demo y genera el escenario completo de prueba.
--
--   admin@tracata.local     / tracata2026   -> ADMINISTRADOR
--   marta@tracata.local     / tracata2026   -> RESPONSABLE de La Huerta
--   jose@tracata.local      / tracata2026   -> RESPONSABLE de Raspa
-- =============================================================================

-- crypt()/gen_salt() para las contraseñas de los usuarios demo
create extension if not exists pgcrypto;

do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_marta uuid := '22222222-2222-4222-8222-222222222222';
  v_jose  uuid := '33333333-3333-4333-8333-333333333333';
  v_user  record;
begin
  for v_user in
    select * from (values
      (v_admin, 'admin@tracata.local', 'Administrador', 'admin'),
      (v_marta, 'marta@tracata.local', 'Marta (La Huerta)', 'manager'),
      (v_jose,  'jose@tracata.local',  'Jose (Raspa)', 'manager')
    ) as t(id, email, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
      v_user.email, crypt('tracata2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user.full_name),
      now(), now()
    ) on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      v_user.id::text, v_user.id,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;

    insert into public.profiles (id, email, full_name, role)
    values (v_user.id, v_user.email, v_user.full_name, v_user.role::app_role)
    on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
  end loop;

  -- Escenario completo de prueba
  perform dev_seed_demo_data(v_admin);

  -- Cada responsable solo puede ver su establecimiento
  insert into user_establishments (user_id, establishment_id)
  select v_marta, id from establishments where name = 'La Huerta'
  on conflict do nothing;
  insert into user_establishments (user_id, establishment_id)
  select v_jose, id from establishments where name = 'Raspa'
  on conflict do nothing;
end $$;
