create extension if not exists pgcrypto;

create table if not exists public.tunnel_tunnels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.tunnel_routes (
  id uuid primary key default gen_random_uuid(),
  tunnel_id uuid not null references public.tunnel_tunnels(id) on delete cascade,
  hostname text not null unique,
  target text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tunnel_routes_tunnel_id_idx on public.tunnel_routes(tunnel_id);
create index if not exists tunnel_routes_hostname_idx on public.tunnel_routes(hostname);

create or replace function public.tunnel_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tunnel_routes_set_updated_at on public.tunnel_routes;
create trigger tunnel_routes_set_updated_at
before update on public.tunnel_routes
for each row execute function public.tunnel_set_updated_at();
