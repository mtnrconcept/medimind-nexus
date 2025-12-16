-- Migration: Fix user profile creation for auth users
-- Issue: cde_user_edges requires profile entry but user may not have one
-- Solution: Create profiles automatically for existing auth users

-- 1. Ensure profiles table has an entry for all auth users
INSERT INTO profiles (id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- 2. Create a trigger to auto-create profiles for new users
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_profile_for_user();

-- 3. Alternative: Change cde_user_edges to reference auth.users directly (optional)
-- This is commented out as it may break existing RLS policies
-- ALTER TABLE cde_user_edges DROP CONSTRAINT IF EXISTS cde_user_edges_user_id_fkey;
-- ALTER TABLE cde_user_edges ADD CONSTRAINT cde_user_edges_user_id_fkey 
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
