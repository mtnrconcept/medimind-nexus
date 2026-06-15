-- Migration: Fix RLS policies for cde_user_edges
-- Created: 2025-12-16
-- Description: Adds missing RLS policies to allow users to manage their own edges

-- Ensure RLS is enabled
ALTER TABLE cde_user_edges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Users can view their own edges" ON cde_user_edges;
DROP POLICY IF EXISTS "Users can create their own edges" ON cde_user_edges;
DROP POLICY IF EXISTS "Users can update their own edges" ON cde_user_edges;
DROP POLICY IF EXISTS "Users can delete their own edges" ON cde_user_edges;

-- Create policies
-- SELECT: Users can see their own edges
CREATE POLICY "Users can view their own edges"
ON cde_user_edges FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: Users can create edges linked to their account
CREATE POLICY "Users can create their own edges"
ON cde_user_edges FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own edges
CREATE POLICY "Users can update their own edges"
ON cde_user_edges FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own edges
CREATE POLICY "Users can delete their own edges"
ON cde_user_edges FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Grant access to authenticated users
GRANT ALL ON cde_user_edges TO authenticated;
