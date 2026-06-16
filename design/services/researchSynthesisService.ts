import { MedicalSynthesis, ResearchPaper } from "../types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function scorePaper(queryTerms: string[], paper: ResearchPaper): number {
  const haystack = [
    paper.title,
    paper.abstract,
    paper.author,
    paper.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const termScore = queryTerms.reduce((score, term) => {
    return score + (haystack.includes(term) ? 1 : 0);
  }, 0);

  return termScore * 20 + paper.relevance + Math.log10(paper.citations + 1) * 10;
}

export class ResearchSynthesisService {
  async synthesizeResearch(query: string, papers: ResearchPaper[]): Promise<MedicalSynthesis> {
    const queryTerms = tokenize(query);
    const ranked = papers
      .map((paper) => ({
        paper,
        score: scorePaper(queryTerms, paper),
      }))
      .sort((a, b) => b.score - a.score);

    const selected = ranked.slice(0, 3).map((entry) => entry.paper);
    const lead = selected[0];
    const tags = Array.from(new Set(selected.flatMap((paper) => paper.tags))).slice(0, 5);

    if (!lead) {
      return {
        summary: `No indexed papers are available for "${query}".`,
        keyInsights: [
          "Add curated papers or connect the production clinical research API before using this prototype for real analysis.",
        ],
        clinicalSignificance:
          "This local prototype cannot make clinical claims without retrieved sources.",
        futureDirections: [
          "Run the query through the production OpenAI clinical route with citations.",
        ],
      };
    }

    return {
      summary: `Local synthesis ranked ${selected.length} papers for "${query}". The strongest match is "${lead.title}" by ${lead.author}.`,
      keyInsights: selected.map((paper) => {
        const topic = paper.tags.slice(0, 2).join(", ") || "biomedical research";
        return `${paper.title}: ${topic}; relevance ${paper.relevance}/100 with ${paper.citations} citations.`;
      }),
      clinicalSignificance:
        tags.length > 0
          ? `The visible evidence clusters around ${tags.join(", ")}. Treat this as triage context, not a clinical recommendation.`
          : "The visible evidence is insufficient for a clinical recommendation.",
      futureDirections: [
        "Retrieve official labels, guidelines, and PubMed abstracts before final synthesis.",
        "Escalate high-risk or contradictory cases to the server-side GPT-5.5 clinical route.",
        "Require source URLs and uncertainty fields for any user-facing medical answer.",
      ],
    };
  }
}

export const researchSynthesisService = new ResearchSynthesisService();
