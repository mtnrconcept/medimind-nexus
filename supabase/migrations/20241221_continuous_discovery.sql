-- Continuous Discovery Schema
-- Created: 2024-01-21
-- Purpose: Tables for automated literature monitoring and alerting

-- Discovery Alerts table
-- Stores notifications about new findings, contradictions, and updates
CREATE TABLE IF NOT EXISTS public.discovery_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('new_evidence', 'contradiction', 'citation_spike', 'trial_update', 'hypothesis_support', 'hypothesis_refute')),
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    source_id TEXT,
    source_type TEXT CHECK (source_type IN ('pubmed', 'clinicaltrials', 'openalex', 'europepmc')),
    source_url TEXT,
    related_hypothesis_id UUID,
    related_paper_ids TEXT[],
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
);

-- Discovery Subscriptions table
-- Stores user monitoring queries for automated literature tracking
CREATE TABLE IF NOT EXISTS public.discovery_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    sources TEXT[] DEFAULT ARRAY['pubmed', 'clinicaltrials', 'openalex'],
    filters JSONB DEFAULT '{}',
    frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('hourly', 'daily', 'weekly')),
    max_results_per_run INTEGER DEFAULT 50,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_run_count INTEGER DEFAULT 0,
    total_papers_found INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discovery Run History table
-- Tracks each execution of the continuous discovery pipeline
CREATE TABLE IF NOT EXISTS public.discovery_run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES public.discovery_subscriptions(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    papers_found INTEGER DEFAULT 0,
    alerts_generated INTEGER DEFAULT 0,
    contradictions_found INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discovery_alerts_user_id ON public.discovery_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_alerts_unread ON public.discovery_alerts(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_discovery_alerts_type ON public.discovery_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_discovery_alerts_created_at ON public.discovery_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_subscriptions_user_id ON public.discovery_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_subscriptions_next_run ON public.discovery_subscriptions(next_run_at) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_discovery_run_history_subscription ON public.discovery_run_history(subscription_id);

-- RLS Policies
ALTER TABLE public.discovery_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_run_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own alerts
CREATE POLICY "Users can view their own alerts" ON public.discovery_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts" ON public.discovery_alerts
    FOR UPDATE USING (auth.uid() = user_id);

-- System can insert alerts for any user
CREATE POLICY "System can insert alerts" ON public.discovery_alerts
    FOR INSERT WITH CHECK (TRUE);

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage their own subscriptions" ON public.discovery_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- Run history is viewable by subscription owner
CREATE POLICY "Users can view their subscription runs" ON public.discovery_run_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.discovery_subscriptions s
            WHERE s.id = discovery_run_history.subscription_id
            AND s.user_id = auth.uid()
        )
    );

-- Function to mark alert as read
CREATE OR REPLACE FUNCTION mark_alert_read(alert_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.discovery_alerts
    SET is_read = TRUE, read_at = NOW()
    WHERE id = alert_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to dismiss alert
CREATE OR REPLACE FUNCTION dismiss_alert(alert_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.discovery_alerts
    SET is_dismissed = TRUE, dismissed_at = NOW()
    WHERE id = alert_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread alert count
CREATE OR REPLACE FUNCTION get_unread_alert_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM public.discovery_alerts
        WHERE user_id = auth.uid()
        AND is_read = FALSE
        AND is_dismissed = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
