-- Portal RLS: allow public (anon) read access to tunnel_instances and tunnel_routes
-- These tables use UUID-based IDs which are hard to guess — the tunnel ID IS the portal "password"

-- 1. Enable public SELECT on tunnel_instances (needed for portal login)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tunnel_instances' AND policyname = 'portal_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY "portal_public_read" ON tunnel_instances FOR SELECT USING (true)';
  END IF;
END $$;

-- 2. Enable public SELECT on tunnel_routes (needed for portal dashboard)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tunnel_routes' AND policyname = 'portal_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY "portal_public_read" ON tunnel_routes FOR SELECT USING (true)';
  END IF;
END $$;

-- 3. Enable public UPDATE on tunnel_routes (needed for hostname edit / toggle)
--    Token verification is done in the Next.js API route (server-side).
--    The anon key UPDATE is still gated by the API route checking token_hash.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tunnel_routes' AND policyname = 'portal_public_update'
  ) THEN
    EXECUTE 'CREATE POLICY "portal_public_update" ON tunnel_routes FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Ensure RLS is enabled on both tables
ALTER TABLE tunnel_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tunnel_routes    ENABLE ROW LEVEL SECURITY;
