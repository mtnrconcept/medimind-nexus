import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterMedicalGlossary, filterResearchSkills, librarySearchAlias, RESEARCH_SKILLS } from '../src/lib/medicalLibrary.ts';

test('French and English scientific terms search via the same known aliases', () => {
  assert.equal(librarySearchAlias('syndrome néphrotique'), 'nephrotic syndrome');
  assert.equal(librarySearchAlias('varicelle'), 'varicella');
  assert.equal(librarySearchAlias('NPHS1'), '');
  assert.equal(librarySearchAlias('random unrecognised clinical label'), '');
});

test('partial French terms remain searchable and accent-insensitive', () => {
  assert.equal(librarySearchAlias('néphro'), 'nephrotic syndrome');
  assert.ok(filterMedicalGlossary('nephrotique').some(t => t.en === 'nephrotic syndrome'));
  assert.ok(filterMedicalGlossary('nephrotic').some(t => t.fr.includes('néphrotique')));
});

test('research skills have stable identifiers, explicit caution and a public example', () => {
  assert.ok(RESEARCH_SKILLS.length >= 15);
  assert.equal(new Set(RESEARCH_SKILLS.map(x => x.id)).size, RESEARCH_SKILLS.length);
  for (const skill of RESEARCH_SKILLS) {
    assert.ok(skill.verification.length >= 10);
    assert.ok(skill.example.length >= 2);
    assert.ok(['disease','drug','gene'].includes(skill.mode));
  }
  assert.ok(filterResearchSkills('pharmacogénétique').some(x => x.id === 'pharmacogenomics'));
  assert.ok(filterResearchSkills('prisma').some(x => x.id === 'systematic'));
});
