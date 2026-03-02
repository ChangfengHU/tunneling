-- ==========================================================
-- 修复 CLI 终端匿名创建 Tunnel 报错 "null value in column user_id"
-- ==========================================================

ALTER TABLE public.tunnel_instances ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS project_key TEXT;
