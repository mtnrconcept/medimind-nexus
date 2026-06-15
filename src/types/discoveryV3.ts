export interface EntityRef {
    label: string;
    type: "PATHOLOGY" | "SYMPTOM" | "COMPLICATION" | "ADVERSE_EFFECT" | "TREATMENT" | "MOLECULE" | "TARGET" | "PATHWAY" | "BIOMARKER" | "RESEARCH_PROJECT" | "OUTCOME";
    norm_ids: string[];
    synonyms: string[];
    acronyms?: string[];
    lang?: string;
}

export interface ClinicalScope {
    primary_entity: EntityRef;
    population: {
        age_group: "pediatric" | "adult" | "mixed" | "unknown";
        setting: "inpatient" | "outpatient" | "mixed" | "unknown";
        region?: string;
    };
    candidate_subtypes: {
        entity: EntityRef;
        probability: number;
        criteria: string[];
    }[];
    key_biomarkers: {
        entity: EntityRef;
        role: "stratification" | "diagnostic" | "prognostic" | "monitoring" | "unknown";
    }[];
    exclusions: string[];
    uncertainties: string[];
    gating_assumptions: string[];
}

export interface Evidence {
    evidence_id: string;
    source_type: "guideline" | "rct" | "meta_analysis" | "observational" | "case_report" | "preclinical" | "registry" | "patent" | "preprint" | "other";
    title: string;
    published_at: string;
    level: string;
    url_or_id: string;
    passages: {
        quote: string;
        location: string;
        extraction_confidence: number;
    }[];
    quality_signals: {
        peer_reviewed: boolean;
        sample_size_hint: string;
        risk_of_bias_hint: string;
    };
}

export interface ClaimScores {
    evidence_quality: number;
    replication: number;
    consistency: number;
    context_match: number;
    safety_risk: number;
    mechanistic_plausibility: number;
    novelty: number;
    aggregate: number;
}

export interface Claim {
    claim_id: string;
    triple: {
        source: EntityRef;
        rel: "TREATS" | "CAUSES" | "ASSOCIATED_WITH" | "BIOMARKER_OF" | "TARGETS" | "MODULATES" | "INCREASES_RISK" | "DECREASES_RISK" | "CONTRAINDICATED_IN" | "INTERACTS_WITH";
        target: EntityRef;
    };
    scores: ClaimScores;
    support_evidence_ids: string[];
    refute_evidence_ids: string[];
    conditions: string[];
    notes?: string;
}

export interface ClaimGraph {
    claims: Claim[];
    core_claim_ids: string[];
    outcomes: {
        outcome: EntityRef;
        criteria: string[];
        linked_claim_ids: string[];
    }[];
}

export interface Contradiction {
    claim_id: string;
    summary: string;
    refute_evidence_ids: string[];
    impact: "low" | "medium" | "high" | "unknown";
}

export interface NoveltyFinding {
    finding_id: string;
    hypothesis: string;
    bridge_terms: string[];
    support_claim_ids: string[];
    why_non_obvious: string;
    novelty_score: number;
    validation_plan_id: string;
}

export interface ValidationPlanItem {
    id: string;
    goal: string;
    minimal_tests: string[];
    endpoints: string[];
    failure_modes: string[];
    linked_claim_ids: string[];
}

export interface ReasoningTrace {
    retrieval_log: {
        query: string;
        sources: string[];
        filters?: Record<string, unknown>;
        n_docs: number;
        timestamp: string;
    }[];
    normalization_log: {
        raw: string;
        mapped_entity: EntityRef;
        ambiguity: "low" | "medium" | "high";
        decision: string;
    }[];
    inference_steps: {
        rule: "DIRECT_EVIDENCE" | "ABC_LBD" | "MECHANISTIC_ANALOGY" | "SAFETY_GATING" | "CONTRADICTION_ARBITRATION";
        inputs: string[];
        outputs: string[];
        rationale: string;
    }[];
    limitations: string[];
}

export interface GlobalScores {
    overall_confidence: number;
    overall_novelty: number;
    overall_risk: number;
    coverage: {
        claims: number;
        evidences: number;
        contradictions_checked: boolean;
    };
}

export interface HypothesisUltraV3 {
    id: string;
    hypothesis_id: string;
    statement: string;
    created_at: string;
    status: "draft" | "pending" | "reviewed" | "rejected" | "archived";
    disclaimer: string;
    clinical_scope: ClinicalScope;
    executive_summary?: {
        context: string;
        go_nogo_table: Record<string, unknown>[];
        scope_decisions: string;
    };
    claim_graph: ClaimGraph;
    evidence_index: Evidence[];
    contradictions: Contradiction[];
    novelty_findings: NoveltyFinding[];
    validation_plan: ValidationPlanItem[];
    reasoning_trace: ReasoningTrace;
    scores: GlobalScores;
    policy_flags?: {
        contains_dosing: boolean;
        contains_personal_medical_advice: boolean;
        requires_human_clinician_review: boolean;
    };
}
