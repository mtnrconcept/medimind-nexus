
export interface ResearchPaper {
  id: string;
  title: string;
  author: string;
  date: string;
  abstract: string;
  tags: string[];
  relevance: number;
  citations: number;
}

export interface MedicalSynthesis {
  summary: string;
  keyInsights: string[];
  clinicalSignificance: string;
  futureDirections: string[];
}

export enum ViewMode {
  GRID = 'grid',
  VISUALIZER = 'visualizer',
  ANALYSIS = 'analysis'
}
