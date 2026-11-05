import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCausalLink, ensureAnalysisShape, ensureSchemaComparison, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { isAppropriatenessSuccess, canDisplayRiskScore } from '../src/components/patient/crossDataDisplay.ts';
import { medicalSearchTerms } from '../supabase/functions/_shared/medical-terminology.ts';

const entity: SelectedElement[] = [
  { name: 'Ciclosporine', type: 'medication', atcCode: 'S01XA18' },
  { name: 'Varicelle', type: 'pathology' },
  { name: 'Œdème des paupières', type: 'symptom' },
  { name: 'Prednisolone', type: 'medication' },
];
function link(from: number, to: number, extra: Record<string, unknown> = {}) {
  return normalizeCausalLink({ from: entity[from].name, fromType: entity[from].type,
    to: entity[to].name, toType: entity[to].type,
    relationship: 'Administration concomitante rapportée', evidence: 'Un cas rapporte une utilisation, sans effet isolé démontré.',
    webSources: ['https://pubmed.ncbi.nlm.nih.gov/32118671/'], ...extra }, entity)!;
}
test('a cited medication-disease co-occurrence is never upgraded to a treatment by default', () => {
  assert.equal(link(0, 1).effectType, undefined);
  assert.equal(link(0, 1).isAppropriate, undefined);
});
test('a medication administered after swelling is not automatically its cause', () => {
  assert.equal(link(3, 2).effectType, undefined);
});
test('two concomitant medicines do not imply a proven interaction or severity', () => {
  assert.equal(link(0, 3).interactionType, undefined);
  assert.equal(link(0, 3).dangerLevel, undefined);
});
test('invalid clinical enums cannot silently become an adverse effect or moderate danger', () => {
  const v=link(0,1,{effectType:'not-known',dangerLevel:'unknown',symptomFrequency:'not-known'});
  assert.equal(v.effectType,undefined); assert.equal(v.dangerLevel,undefined); assert.equal(v.symptomFrequency,undefined);
});
test('historical affirmative booleans cannot produce an Adapté badge without a validated relation contract', () => {
  assert.equal(isAppropriatenessSuccess({fromType:'medication',toType:'pathology',isAppropriate:true}),false);
});
test('a bibliography is not a validated quantitative benefit-risk score', () => {
  const comparison=ensureSchemaComparison(ensureAnalysisShape({causalLinks:[link(0,1)]}));
  assert.equal(comparison.currentScore,null);
  assert.equal(comparison.proposedScore,null);
  assert.deepEqual(comparison.proposedChanges,[]);
  assert.equal(canDisplayRiskScore([link(0,1)],100),false);
});
test('an imported diagnostic code qualifier must not make literature search an exact zero-result phrase', () => {
  const terms=medicalSearchTerms({name:'Nephrotic syndrome, IIa 26',type:'pathology'});
  assert.ok(terms.includes('nephrotic syndrome'));
  assert.ok(medicalSearchTerms({name:'Varicella (VZV) infection',type:'pathology'}).includes('varicella'));
});

import { readCells } from '../supabase/functions/cross-data-analyzer/matrix-progress.ts';
import { buildPairCandidates } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
const clinicalPair=buildPairCandidates(entity.slice(0,2))[0];
const sourceUrl='https://pubmed.ncbi.nlm.nih.gov/32118671/';
const source={url:sourceUrl,title:'Stromal keratitis after varicella in children',abstract:'Three children received topical cyclosporine as adjunctive treatment for stromal keratitis after varicella. No isolated antiviral effect was established.',publicationTypes:['Case Reports']};
function cell(extra:Record<string,unknown>={}) { return {pairHash:clinicalPair.pairHash,links:[{
  from:'Ciclosporine',fromType:'medication',to:'Varicelle',toType:'pathology',
  relationship:'Indication antivirale',evidence:'Une utilisation dans une complication oculaire est rapportée.',
  webSources:[sourceUrl],relationKind:'indication',
  context:{condition:'same',route:'same',temporality:'after_exposure'},
  evidenceQuotes:[{url:sourceUrl,quote:source.abstract,support:'direct'}], ...extra,
}]}; }
test('a source URL without an exact supporting passage is not a clinically classified relation',()=>{
  const v=readCells([cell({evidenceQuotes:[]})],[clinicalPair],{[clinicalPair.pairHash]:[source]});
  assert.deepEqual(v[clinicalPair.pairHash],[]);
});
test('a fabricated quote cannot pass merely because its URL was retrieved',()=>{
  const v=readCells([cell({evidenceQuotes:[{url:sourceUrl,quote:'Cyclosporine cures primary chickenpox safely in all patients.',support:'direct'}]})],[clinicalPair],{[clinicalPair.pairHash]:[source]});
  assert.deepEqual(v[clinicalPair.pairHash],[]);
});
test('an ocular adjunctive case report never becomes systemic antiviral efficacy for varicella',()=>{
  const v=readCells([cell()],[clinicalPair],{[clinicalPair.pairHash]:[source]});
  assert.equal(v[clinicalPair.pairHash][0]?.relationKind,'adjunctive_use');
  assert.equal(v[clinicalPair.pairHash][0]?.evidenceSupport,'contextual');
  assert.equal(v[clinicalPair.pairHash][0]?.effectType,undefined);
  assert.equal(v[clinicalPair.pairHash][0]?.relationship,'Usage complémentaire');
  assert.ok(v[clinicalPair.pairHash][0]?.evidence.includes('ne signifie pas'));
  assert.equal(v[clinicalPair.pairHash][0]?.isAppropriate,undefined);
});
test('a different route cannot support an indication in the selected formulation',()=>{
  const v=readCells([cell({context:{condition:'same',route:'different',temporality:'not_reported'}})],[clinicalPair],{[clinicalPair.pairHash]:[source]});
  assert.notEqual(v[clinicalPair.pairHash][0]?.evidenceSupport,'direct');
});

test('a model claim of same route cannot transfer systemic evidence to an ophthalmic product',()=>{
  const pair=buildPairCandidates([{name:'Ciclosporine',type:'medication',atcCode:'S01XA18'}, {name:'Syndrome néphrotique',type:'pathology'}])[0];
  const abstract='Oral cyclosporine was compared with placebo in participants with nephrotic syndrome and reduced proteinuria.';
  const source={url:sourceUrl,title:'Systemic cyclosporine for nephrotic syndrome',abstract,publicationTypes:['Randomized Controlled Trial']};
  const row={pairHash:pair.pairHash,links:[{from:pair.left.name,fromType:pair.left.type,to:pair.right.name,toType:pair.right.type,
    relationship:'Indication étudiée',evidence:'Relation décrite dans la source.',relationKind:'indication',context:{condition:'same',route:'same'},
    evidenceQuotes:[{url:sourceUrl,quote:abstract,support:'direct'}],webSources:[sourceUrl]}]};
  const checked=readCells([row],[pair],{[pair.pairHash]:[source]})[pair.pairHash][0];
  assert.ok(checked); assert.equal(checked.evidenceSupport,'contextual');
  assert.ok(checked.contextLimitations?.some(v=>/voie|ophtalm|systémique/i.test(v)));
});
test('a specific intravenous study can remain an indication studied, never a positive suitability badge',()=>{
  const pair=buildPairCandidates([{name:'Aciclovir, solution pour perfusion',type:'medication'}, {name:'Varicelle',type:'pathology'}])[0];
  const abstract='Intravenous acyclovir was compared with placebo in patients with primary varicella in this controlled study.';
  const source={url:sourceUrl,title:'Intravenous acyclovir for primary varicella',abstract,publicationTypes:['Randomized Controlled Trial']};
  const row={pairHash:pair.pairHash,links:[{from:pair.left.name,fromType:pair.left.type,to:pair.right.name,toType:pair.right.type,
    relationship:'Indication étudiée',evidence:'La source étudie cette molécule dans cette voie.',relationKind:'indication',context:{condition:'same',route:'same'},
    evidenceQuotes:[{url:sourceUrl,quote:abstract,support:'direct'}],webSources:[sourceUrl]}]};
  const checked=readCells([row],[pair],{[pair.pairHash]:[source]})[pair.pairHash][0];
  assert.ok(checked); assert.equal(checked.relationKind,'indication'); assert.equal(checked.evidenceSupport,'direct');
  assert.equal(isAppropriatenessSuccess(checked),false);
});

import { exposeMatrixJob } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';
test('old results are shown as requiring reanalysis without rewriting their archived clinical output',()=>{
  const state={elements:entity,cells:{pair:[link(0,1,{effectType:'therapeutic'})]},batchSize:3,
    analysis:ensureAnalysisShape({summary:'Ancienne conclusion',causalLinks:[link(0,1,{effectType:'therapeutic'})]}),
    pendingEvidence:{pair:[source]}};
  const row={id:'job',status:'completed',updated_at:new Date().toISOString(),progress_message:'Done',progress_percentage:100,error_message:null,
    request_payload:{selection:{}},result_payload:state,provider_response_id:'private-response'};
  const visible=exposeMatrixJob(row)!;
  assert.equal(visible.result_payload.analysis.requiresReanalysis,true);
  assert.deepEqual(visible.result_payload.cells,{});
  assert.deepEqual(visible.result_payload.analysis.causalLinks,[]);
  assert.equal('pendingEvidence' in visible.result_payload,false);
  assert.equal('provider_response_id' in visible,false);
  assert.equal(state.analysis.causalLinks.length,1,'The stored original is not overwritten');
});

test('combined prescribing in a source is not a demonstrated drug interaction',()=>{
  const pair=buildPairCandidates([{name:'Aciclovir oral',type:'medication'}, {name:'Prednisolone comprimé',type:'medication'}])[0];
  const passage='Oral acyclovir and oral prednisolone were administered together to the participants, and their clinical course was described.';
  const src={url:sourceUrl,title:'Clinical observation',abstract:passage};
  const row={pairHash:pair.pairHash,links:[{from:pair.left.name,fromType:pair.left.type,to:pair.right.name,toType:pair.right.type,
    relationship:'Interaction',evidence:'Une relation entre ces médicaments est proposée.',relationKind:'interaction',context:{condition:'same',route:'same'},
    evidenceQuotes:[{url:sourceUrl,quote:passage,support:'direct'}]}]};
  const checked=readCells([row],[pair],{[pair.pairHash]:[src]})[pair.pairHash][0];
  assert.equal(checked.relationKind,'coadministration');assert.equal(checked.evidenceSupport,'contextual');
});
