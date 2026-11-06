import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentCrossAnalysisPanel, type AgentReview } from '../src/components/patient/AgentCrossAnalysisPanel.tsx';

function exampleReview(): AgentReview {
  return {
    model: 'gpt-6-astra',
    stage: 'candidate_pairs',
    coverage: {
      totalPairs: 6, reviewedPairs: 6, webSearchedPairs: 6, uncertainPairs: 1,
      candidatePairs: 4, reviewedCandidatePairs: 2,
    },
    plan: {
      status: 'review_required',
      summary: 'Une option doit être discutée avec le prescripteur.',
      globalRisks: ['Interaction à réévaluer.'],
      missingData: ['Voie d’administration à préciser.'],
      options: [{
        id: 'option-one', title: 'Option de revue thérapeutique', rationale: 'Réévaluer le traitement sélectionné.',
        expectedBenefits: ['Bénéfice potentiel à confirmer.'],
        residualRisks: ['Risque résiduel à vérifier.'], monitoring: ['Surveillance clinique.'],
        requiredChecks: ['Vérifier la chronologie des symptômes.'],
        sourceUrls: ['https://pubmed.ncbi.nlm.nih.gov/12345678/'],
        changes: [{
          action: 'discuss_replace', target: 'Traitement A', replacement: 'Option B',
          rationale: 'Vérifier les interactions avant toute décision.', sourceUrls: [],
        }],
      }],
    },
  };
}

const render = (review: AgentReview) => renderToStaticMarkup(createElement(AgentCrossAnalysisPanel, { review }));

test('candidate review keeps options provisional and displays clinical limits alongside the proposal', () => {
  const html = render(exampleReview());
  assert.match(html, /GPT-6 Astra/);
  assert.match(html, /Options provisoires/);
  assert.match(html, /Vérification des alternatives/);
  for (const text of ['Voie d’administration à préciser.', 'Risque résiduel à vérifier.',
    'Vérifier la chronologie des symptômes.', 'Bénéfice potentiel à confirmer.', 'Remplacement à discuter']) {
    assert.ok(html.includes(text), `Expected clinical context to remain visible: ${text}`);
  }
  assert.match(html, /validation médicale/i);
  assert.doesNotMatch(html, /<button|bénéfice.risque[^<]*\d+\s*%|optimal garanti/i);
});

test('technical completion does not finalize a proposal while selected or candidate pairs remain unreviewed', () => {
  const review = exampleReview();
  review.stage = 'completed';
  assert.match(render(review), /Couverture incomplète/);
  assert.match(render(review), /Options provisoires/);
  review.coverage.reviewedCandidatePairs = 4;
  review.coverage.webSearchedPairs = 5;
  assert.match(render(review), /Couverture incomplète/);
  review.coverage.webSearchedPairs = 6;
  const complete = render(review);
  assert.match(complete, /Revue IA terminée/);
  assert.match(complete, /À valider/);
  assert.doesNotMatch(complete, /Options provisoires/);
  assert.match(complete, /absence de risque/);
});

test('source links reject active or credential-bearing URLs and never render model text as HTML', () => {
  const review = exampleReview();
  review.plan!.options[0].sourceUrls = [
    'https://pubmed.ncbi.nlm.nih.gov/12345678/',
    'https://pubmed.ncbi.nlm.nih.gov/12345678/',
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'http://example.org/insecure', 'https://account:secret@example.org/private',
  ];
  review.plan!.options[0].rationale = '<script>unsafe()</script>';
  const html = render(review);
  assert.equal((html.match(/href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/12345678\/"/g) || []).length, 1);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="(?:javascript:|data:|http:)|account:secret|<script>/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
});

test('the panel identifies the returned model and handles a selection without coverage yet', () => {
  const review = exampleReview();
  review.model = 'gpt-6.1-sol';
  review.stage = 'pairs';
  review.plan = undefined;
  review.coverage = {
    totalPairs: 0, reviewedPairs: 0, webSearchedPairs: 0, uncertainPairs: 0,
    candidatePairs: 0, reviewedCandidatePairs: 0,
  };
  const html = render(review);
  assert.match(html, /gpt-6.1-sol/);
  assert.doesNotMatch(html, /GPT-6 Astra|NaN|Infinity|Revue IA terminée/);
  assert.match(html, /Recherche et analyse des paires/);
});

test('the panel identifies pair and review models from metadata when the workflow uses different models', () => {
  const review = { ...exampleReview(), model: 'current-phase-model', pairModel: 'fast-pair-model', reviewModel: 'review-model' };
  const html = render(review);
  assert.match(html, /current-phase-model/);
  assert.match(html, /Relations[^<]*fast-pair-model/);
  assert.match(html, /Revue[^<]*review-model/);
  assert.doesNotMatch(html, /GPT-6 Astra/);
});
