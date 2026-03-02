-- ==========================================================
-- 为个人超管模式 放开所有数据的 RLS（只要登录就能看到所有数据）
-- ==========================================================

-- 1. Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.tunnel_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.tunnel_profiles;
CREATE POLICY "Allow authenticated users to view all profiles" ON public.tunnel_profiles FOR SELECT USING (auth.role() = 'authenticated');

-- 2. Tunnels
DROP POLICY IF EXISTS "Users can manage own tunnels" ON public.tunnel_instances;
DROP POLICY IF EXISTS "Admins can manage all tunnels" ON public.tunnel_instances;
CREATE POLICY "Allow authenticated users to manage all tunnels" ON public.tunnel_instances FOR ALL USING (auth.role() = 'authenticated');

-- 3. Routes
DROP POLICY IF EXISTS "Users can manage routes for their tunnels" ON public.tunnel_routes;
DROP POLICY IF EXISTS "Admins can manage all routes" ON public.tunnel_routes;
CREATE POLICY "Allow authenticated users to manage all routes" ON public.tunnel_routes FOR ALL USING (auth.role() = 'authenticated');

-- 4. Usage Logs
DROP POLICY IF EXISTS "Users can view own usage" ON public.tunnel_usage_logs;
CREATE POLICY "Allow authenticated users to view all usage" ON public.tunnel_usage_logs FOR SELECT USING (auth.role() = 'authenticated');
