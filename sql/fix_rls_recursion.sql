-- ==============================================================
-- 修复 RLS 无限递归 + 创建超管 Profile
-- 在 Supabase → SQL Editor 执行
-- ==============================================================

-- ---------------------------------------------------------------
-- 第一步：删除 tunnel_profiles 上的所有 Policy（包括有问题的）
-- ---------------------------------------------------------------
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tunnel_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tunnel_profiles', pol.policyname);
    END LOOP;
END $$;

-- 用 auth.uid() IS NOT NULL 代替 auth.role()='authenticated'
-- 效果完全相同，但不会引发递归
CREATE POLICY "allow_authed_users"
    ON public.tunnel_profiles FOR ALL
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------
-- 第二步：同样修复 tunnel_instances 的 Policy
-- ---------------------------------------------------------------
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tunnel_instances'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tunnel_instances', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "allow_authed_users"
    ON public.tunnel_instances FOR ALL
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------
-- 第三步：同样修复 tunnel_routes 的 Policy
-- ---------------------------------------------------------------
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tunnel_routes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tunnel_routes', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "allow_authed_users"
    ON public.tunnel_routes FOR ALL
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------
-- 第四步：为 admin@test.com 创建 Profile 并设为 super_admin
-- ---------------------------------------------------------------
INSERT INTO public.tunnel_profiles (id, full_name, role)
SELECT
    id,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
    'super_admin'
FROM auth.users
WHERE email = 'admin@test.com'
ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

-- ---------------------------------------------------------------
-- 验证：执行完后确认结果
-- ---------------------------------------------------------------
SELECT
    u.email,
    p.role,
    p.id
FROM auth.users u
LEFT JOIN public.tunnel_profiles p ON p.id = u.id
WHERE u.email = 'admin@test.com';
