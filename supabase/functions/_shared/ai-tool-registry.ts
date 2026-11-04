/** Public tool entry points only. Internal workers and native jobs are excluded. */
export const DURABLE_AI_TOOLS = [
  'adversarial-reviewer', 'ai-assistant', 'analyze-kg-links', 'analyze-user-links',
  'causal-reasoning', 'cde-systematic-analyze', 'continuous-discovery-pipeline',
  'deep-research-graph', 'detect-side-effects', 'discovery-engine', 'discovery-platform', 'discovery-search',
  'document-analyzer', 'embed-data', 'expand-graph', 'focused-research',
  'generate-embeddings', 'generate-molecule', 'graph-chat', 'hypothesis-generator',
  'knowledge-extractor', 'lbd-analogy-finder', 'lbd-contradiction-detector',
  'lbd-expand-node', 'lbd-orchestrator', 'lbd-swanson-abc', 'live-research',
  'medical-scraper', 'neural-kg', 'pathology-analyzer', 'radial-rings-engine',
  'scientific-analysis', 'symptom-questionnaire', 'systematic-research',
  'targeted-research', 'translate', 'translate-database', 'validate-hypothesis',
] as const;

const toolNames: ReadonlySet<string> = new Set(DURABLE_AI_TOOLS);
export function isDurableAITool(name: string): boolean { return toolNames.has(name); }

export const NATIVE_AI_JOB_TOOLS: ReadonlySet<string> = new Set([
  'cross-data-analyzer', 'deep-research', 'cde-analyze', 'patient-health-synthesis',
]);
