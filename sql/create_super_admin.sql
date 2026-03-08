-- ==============================================================
-- ⚠️ 仅供初始化使用的 [超管账号创建脚本] 
-- 修复版
-- ==============================================================

DO $$
DECLARE
  new_admin_id uuid := gen_random_uuid();
BEGIN
  -- 1. 向 Supabase 核心认证表插入用户信息
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_admin_id,
    'authenticated',
    'authenticated',
    'vyibcbi@gmail.com',
    crypt('sd123456*', gen_salt('bf')),
    now(),
    '{"full_name": "Super Admin"}'::jsonb,
    now(),
    now()
  );

  -- 2. 上面那一步触发了我们之前写的 trigger，此时 profiles 表里已经有这条记录了。
  -- 下面这行代码强制将其提升为 `super_admin`
  UPDATE public.tunnel_profiles
  SET role = 'super_admin'
  WHERE id = new_admin_id;

END $$;
