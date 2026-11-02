import {
  buildPairCandidates, normalizeCausalLink, type CausalLink, type PairCandidate, type SelectedElement,
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
