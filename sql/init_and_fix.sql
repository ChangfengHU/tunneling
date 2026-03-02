-- ==============================================================
-- 全量初始化 + 修复脚本（安全可重复执行，不会丢失已有数据）
-- 在 Supabase → SQL Editor 中执行此文件
-- ==============================================================

-- ---------------------------------------------------------------
-- 1. 基础扩展
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------
-- 2. 用户 Profile 表（关联 Supabase auth.users）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tunnel_profiles (
    id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name   TEXT,
    avatar_url  TEXT,
    role        TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 3. Tunnel 实例表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tunnel_instances (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 可为空（CLI 创建）
    owner_id    TEXT,       -- CLI 注册时携带的用户标识
    project_key TEXT,       -- 项目名称
    name        TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    status      TEXT DEFAULT 'offline' CHECK (status IN ('offline', 'online')),
    last_seen_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 补充可能缺失的列（幂等）
ALTER TABLE public.tunnel_instances ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS owner_id    TEXT;
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS status      TEXT DEFAULT 'offline';
ALTER TABLE public.tunnel_instances ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tunnel_instances_owner ON public.tunnel_instances(owner_id);

-- ---------------------------------------------------------------
-- 4. 路由映射表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tunnel_routes (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tunnel_id   UUID REFERENCES public.tunnel_instances(id) ON DELETE CASCADE NOT NULL,
    hostname    TEXT NOT NULL UNIQUE,
    target      TEXT NOT NULL,
    is_enabled  BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tunnel_routes_tunnel_id ON public.tunnel_routes(tunnel_id);
CREATE INDEX IF NOT EXISTS idx_tunnel_routes_hostname  ON public.tunnel_routes(hostname);

-- ---------------------------------------------------------------
-- 5. RLS 策略（已登录用户可读写所有数据）
-- ---------------------------------------------------------------

-- tunnel_profiles
ALTER TABLE public.tunnel_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_profiles_all"        ON public.tunnel_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to view all profiles" ON public.tunnel_profiles;
CREATE POLICY "rls_profiles_all"
    ON public.tunnel_profiles FOR ALL
    USING (auth.role() = 'authenticated');

-- tunnel_instances
ALTER TABLE public.tunnel_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_instances_all"       ON public.tunnel_instances;
DROP POLICY IF EXISTS "Allow authenticated users to manage all tunnels" ON public.tunnel_instances;
CREATE POLICY "rls_instances_all"
    ON public.tunnel_instances FOR ALL
    USING (auth.role() = 'authenticated');

-- tunnel_routes
ALTER TABLE public.tunnel_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_routes_all"          ON public.tunnel_routes;
DROP POLICY IF EXISTS "Allow authenticated users to manage all routes" ON public.tunnel_routes;
CREATE POLICY "rls_routes_all"
    ON public.tunnel_routes FOR ALL
    USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------
-- 6. 自动更新 updated_at 的触发器函数
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at  ON public.tunnel_profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.tunnel_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_instances_updated_at ON public.tunnel_instances;
CREATE TRIGGER trg_instances_updated_at
    BEFORE UPDATE ON public.tunnel_instances
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_routes_updated_at    ON public.tunnel_routes;
CREATE TRIGGER trg_routes_updated_at
    BEFORE UPDATE ON public.tunnel_routes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- 7. 新用户注册时自动创建 Profile（触发器）
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.tunnel_profiles (id, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')
    )
    ON CONFLICT (id) DO NOTHING;   -- 避免重复插入
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------
-- 8. 为已存在但没有 Profile 行的用户补充 Profile
-- ---------------------------------------------------------------
INSERT INTO public.tunnel_profiles (id, full_name, role)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    'user'
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM public.tunnel_profiles p WHERE p.id = u.id
);

-- ---------------------------------------------------------------
-- 9. ✅ 将第一个注册用户提升为 super_admin
--    （或者根据邮箱精确指定，见下方注释）
-- ---------------------------------------------------------------

-- 方案A：把所有已有用户都提升为 super_admin（适合只有一个管理员时）
UPDATE public.tunnel_profiles
SET role = 'super_admin'
WHERE id IN (
    SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1
);

-- 方案B：按邮箱精确升级（推荐，把下面的邮箱改成你的）
-- UPDATE public.tunnel_profiles
-- SET role = 'super_admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
