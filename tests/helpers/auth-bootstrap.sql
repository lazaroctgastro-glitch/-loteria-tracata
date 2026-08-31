-- Simulación mínima del entorno Supabase para poder ejecutar las migraciones
-- reales dentro de un Postgres embebido (PGlite) durante los tests.
create schema if not exists auth;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
-- Rol con el que PostgREST se conecta realmente y desde el que cambia al rol
-- del usuario. Permite comprobar los permisos tal y como ocurre en producción.
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to current_user;
grant anon, authenticated, service_role to authenticator;

-- Réplica de las columnas de auth.users que usa el seed de Supabase.
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key,
  aud                text,
  role               text,
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists auth.identities (
  provider_id     text,
  user_id         uuid references auth.users (id) on delete cascade,
  identity_data   jsonb,
  provider        text,
  last_sign_in_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  primary key (provider_id, provider)
);

-- Igual que en Supabase: el usuario sale del JWT de la petición.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to authenticated, anon, service_role;
