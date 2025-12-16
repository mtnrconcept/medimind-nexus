-- Migration: Fix RLS Policies for CDE Knowledge Graph
-- Purpose: Allow authenticated users to add new nodes (from NCBI search) and create user-specific edges.
-- Also ensures focused_research_sessions table exists (idempotent) to fix missing history.

-- 0. Ensure focused_research_sessions exists
CREATE TABLE IF NOT EXISTS "public"."focused_research_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES auth.users(id),
  "target_type" text NOT NULL CHECK (target_type IN ('pathology', 'medication', 'substance')),
  "target_id" uuid,
  "target_name" text NOT NULL,
  "journey_steps" jsonb DEFAULT '[]'::jsonb,
  "discoveries" jsonb DEFAULT '[]'::jsonb,
  "simple_explanation" text,
  "full_analysis_text" text,
  "custom_prompt" text,
  "kg_nodes_analyzed" integer DEFAULT 0,
  "kg_edges_analyzed" integer DEFAULT 0,
  "pubmed_articles_found" integer DEFAULT 0,
  "hypotheses_generated" integer DEFAULT 0,
  "status" text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone,
  PRIMARY KEY ("id")
);

-- RLS for focused_research_sessions
ALTER TABLE "public"."focused_research_sessions" ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Drop existing policies to ensure clean state
    DROP POLICY IF EXISTS "Users can view own research sessions" ON "public"."focused_research_sessions";
    DROP POLICY IF EXISTS "Users can create research sessions" ON "public"."focused_research_sessions";
    DROP POLICY IF EXISTS "Users can update own research sessions" ON "public"."focused_research_sessions";
    DROP POLICY IF EXISTS "Service role full access to focused_research_sessions" ON "public"."focused_research_sessions";
END $$;

CREATE POLICY "Users can view own research sessions" ON "public"."focused_research_sessions"
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create research sessions" ON "public"."focused_research_sessions"
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research sessions" ON "public"."focused_research_sessions"
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to focused_research_sessions" ON "public"."focused_research_sessions"
  FOR ALL TO service_role USING (true);


-- 1. Policies for cde_nodes
ALTER TABLE "public"."cde_nodes" ENABLE ROW LEVEL SECURITY;

-- Allow reading all nodes
CREATE POLICY "Enable read access for all users" ON "public"."cde_nodes"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Allow authenticated users to insert new nodes (e.g. from NCBI search)
CREATE POLICY "Enable insert access for authenticated users" ON "public"."cde_nodes"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update nodes (if needed, e.g. adding properties)
CREATE POLICY "Enable update access for authenticated users" ON "public"."cde_nodes"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);


-- 2. Policies for cde_user_edges
-- These are user-specific edges created during analysis sessions
ALTER TABLE "public"."cde_user_edges" ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own edges
CREATE POLICY "Users can manage their own edges" ON "public"."cde_user_edges"
AS PERMISSIVE FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Policies for cde_edges (Global edges)
-- Generally read-only for users, but maybe we want to allow contribution later. 
-- For now, read-only for public/authenticated is usually enough, but let's ensure it's readable.
ALTER TABLE "public"."cde_edges" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."cde_edges"
AS PERMISSIVE FOR SELECT
TO public
USING (true);
