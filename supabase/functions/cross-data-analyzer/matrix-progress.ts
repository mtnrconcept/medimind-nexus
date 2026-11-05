import {
  buildPairCandidates, normalizeCausalLink, type CausalLink, type PairAssessment, type PairCandidate, type SelectedElement,
} from './analysis-utils.ts';

export type MatrixCells = Record<string, CausalLink[]>;
export function pendingPairs(elements: SelectedElement[], cells: MatrixCells) {
  return buildPairCandidates(elements).filter(pair => !Object.hasOwn(cells, pair.pairHash));
}

// Only a complete, explicitly identified response can close a pair. An omitted
// or malformed link must never turn into an audited cell with no finding.
export function readCells(raw: unknown, requested: PairCandidate[]): MatrixCells {
  const cells: MatrixCells = {};
  if (!Array.isArray(raw)) return cells;
  for (const entry of raw) {
    const pair = requested.find(candidate => candidate.pairHash === entry?.pairHash);
    if (!pair || !Array.isArray(entry.links)) continue;
    const links: CausalLink[] = [];
    for (const link of entry.links) {
      if (typeof link?.relationship !== 'string' || !link.relationship.trim() ||
          typeof link.evidence !== 'string' || !link.evidence.trim()) break;
      const normalized = normalizeCausalLink(link, [pair.left, pair.right]);
      if (!normalized) break;
      links.push(normalized);
    }
    if (links.length === entry.links.length) cells[pair.pairHash] = links;
  }
  return cells;
}

/** Missing or malformed AI assessments must never silently close a cell. */
export function readPairAssessments(raw: unknown, requested: PairCandidate[]): Record<string, PairAssessment> {
  const result: Record<string, PairAssessment> = {};
  if (!Array.isArray(raw)) return result;
  const allowed = new Set(requested.map(pair => pair.pairHash));
  for (const entry of raw) {
    const hash = entry?.pairHash;
    const assessment = entry?.assessment;
    if (typeof hash !== 'string' || !allowed.has(hash) || Object.hasOwn(result, hash) ||
        !assessment || typeof assessment !== 'object' ||
        !['cited_relation', 'hypothesis', 'insufficient'].includes(assessment.verdict) ||
        typeof assessment.explanation !== 'string' || assessment.explanation.trim().length < 8 ||
        typeof assessment.limitations !== 'string' || !assessment.limitations.trim()) continue;
    result[hash] = {
      pairHash: hash, source: 'openai',
      verdict: assessment.verdict, explanation: assessment.explanation.trim().slice(0, 1200),
      limitations: assessment.limitations.trim().slice(0, 600),
    };
  }
  return result;
}
