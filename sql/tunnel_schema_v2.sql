-- v2 migration: add tunnel ownership metadata for session-based registration
alter table public.tunnel_tunnels add column if not exists owner_id text;
alter table public.tunnel_tunnels add column if not exists project_key text;

create index if not exists tunnel_tunnels_owner_project_idx
  on public.tunnel_tunnels(owner_id, project_key);
