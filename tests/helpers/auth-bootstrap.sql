-- Simulación mínima del entorno Supabase para poder ejecutar las migraciones
-- reales dentro de un Postgres embebido (PGlite) durante los tests.
create schema if not exists auth;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to current_user;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- Igual que en Supabase: el usuario sale del JWT de la petición.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to authenticated, anon, service_role;
