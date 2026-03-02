-- ==============================================
-- Supabase Schema for Tunnel SaaS Platform (v2)
-- Prefix: tunnel_
-- ==============================================

-- 0. Clean up existing tables (Optional: useful for re-running the script during development)
DROP TABLE IF EXISTS public.tunnel_usage_logs CASCADE;
DROP TABLE IF EXISTS public.tunnel_routes CASCADE;
DROP TABLE IF EXISTS public.tunnel_instances CASCADE;
DROP TABLE IF EXISTS public.tunnel_profiles CASCADE;

-- 1. Profiles Table (extends Supabase auth.users)
CREATE TABLE public.tunnel_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tunnel_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view all profiles"
    ON public.tunnel_profiles FOR SELECT
    USING (auth.role() = 'authenticated');


-- 2. Tunnels Table
CREATE TABLE public.tunnel_instances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_id TEXT,
    project_key TEXT,
    name TEXT NOT NULL,
    description TEXT,
    token_hash TEXT NOT NULL, 
    status TEXT DEFAULT 'offline' CHECK (status IN ('offline', 'online')),
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tunnel_inst_user_id ON public.tunnel_instances(user_id);

ALTER TABLE public.tunnel_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to manage all tunnels"
    ON public.tunnel_instances FOR ALL
    USING (auth.role() = 'authenticated');


-- 3. Routes Table
CREATE TABLE public.tunnel_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tunnel_id UUID REFERENCES public.tunnel_instances(id) ON DELETE CASCADE NOT NULL,
    hostname TEXT NOT NULL UNIQUE, 
    target TEXT NOT NULL,          
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tunnel_routes_tunnel_id ON public.tunnel_routes(tunnel_id);
CREATE INDEX idx_tunnel_routes_hostname ON public.tunnel_routes(hostname);

ALTER TABLE public.tunnel_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to manage all routes"
    ON public.tunnel_routes FOR ALL
    USING (auth.role() = 'authenticated');


-- 4. Traffic Audit / Usage Logs
CREATE TABLE public.tunnel_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tunnel_id UUID REFERENCES public.tunnel_instances(id) ON DELETE CASCADE NOT NULL,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tunnel_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view all usage"
    ON public.tunnel_usage_logs FOR SELECT
    USING (auth.role() = 'authenticated');


-- ==============================================
-- Database Functions & Triggers
-- ==============================================

CREATE OR REPLACE FUNCTION public.handle_new_tunnel_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tunnel_profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$;

-- Note: We drop existing if needed to avoid conflicts when re-running
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_tunnel_user();

CREATE OR REPLACE FUNCTION update_tunnel_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tunnel_profiles_updated_at ON public.tunnel_profiles;
CREATE TRIGGER update_tunnel_profiles_updated_at BEFORE UPDATE ON public.tunnel_profiles FOR EACH ROW EXECUTE PROCEDURE update_tunnel_updated_at_column();

DROP TRIGGER IF EXISTS update_tunnel_instances_updated_at ON public.tunnel_instances;
CREATE TRIGGER update_tunnel_instances_updated_at BEFORE UPDATE ON public.tunnel_instances FOR EACH ROW EXECUTE PROCEDURE update_tunnel_updated_at_column();

DROP TRIGGER IF EXISTS update_tunnel_routes_updated_at ON public.tunnel_routes;
CREATE TRIGGER update_tunnel_routes_updated_at BEFORE UPDATE ON public.tunnel_routes FOR EACH ROW EXECUTE PROCEDURE update_tunnel_updated_at_column();
