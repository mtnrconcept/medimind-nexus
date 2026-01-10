-- Migration: Security Hardening
-- Fixes 'security_definer_view' by setting security_invoker = true
-- Fixes 'rls_disabled_in_public' by enabling RLS and adding policies

-- =================================================================
-- 1. FIX VIEWS (Force Security Invoker to respect RLS)
-- =================================================================

-- unified_medical_entities
ALTER VIEW IF EXISTS public.unified_medical_entities SET (security_invoker = true);

-- patient_complete_profile (Handle if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'patient_complete_profile' AND schemaname = 'public') THEN
    ALTER VIEW public.patient_complete_profile SET (security_invoker = true);
  END IF;
END $$;

-- patient_medical_summary (Handle if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'patient_medical_summary' AND schemaname = 'public') THEN
    ALTER VIEW public.patient_medical_summary SET (security_invoker = true);
  END IF;
END $$;


-- =================================================================
-- 2. ENABLE RLS & ADD POLICIES (Public Tables)
-- =================================================================

-- Tables: 
-- cde_semantic_links, kg_embeddings, cde_node_links, semantic_nodes, graph_cache, knowledge_version

-- cde_semantic_links
ALTER TABLE IF EXISTS public.cde_semantic_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read cde_semantic_links" ON public.cde_semantic_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service/Admin can manage cde_semantic_links" ON public.cde_semantic_links FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());

-- kg_embeddings
ALTER TABLE IF EXISTS public.kg_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kg_embeddings" ON public.kg_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service/Admin can manage kg_embeddings" ON public.kg_embeddings FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());

-- cde_node_links
ALTER TABLE IF EXISTS public.cde_node_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read cde_node_links" ON public.cde_node_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service/Admin can manage cde_node_links" ON public.cde_node_links FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());

-- semantic_nodes
ALTER TABLE IF EXISTS public.semantic_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read semantic_nodes" ON public.semantic_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service/Admin can manage semantic_nodes" ON public.semantic_nodes FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());

-- graph_cache
ALTER TABLE IF EXISTS public.graph_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read graph_cache" ON public.graph_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service/Admin can manage graph_cache" ON public.graph_cache FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());

-- knowledge_version
ALTER TABLE IF EXISTS public.knowledge_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read knowledge_version" ON public.knowledge_version FOR SELECT TO authenticated USING (true);
-- Allow anon read for version checking? Most apps allow this.
CREATE POLICY "Anon can read knowledge_version" ON public.knowledge_version FOR SELECT TO anon USING (true);
CREATE POLICY "Service/Admin can manage knowledge_version" ON public.knowledge_version FOR ALL TO authenticated USING (public.is_admin_optimized()) WITH CHECK (public.is_admin_optimized());
