// Phase 22 part 2 — what the reader brings: sources, look-ups, and the remit
// that checks they did not tilt the report.
import { describe, expect, it } from 'vitest';
import { artefact, assuranceCategories, ASSURANCE_CATEGORIES, ASSURANCE_STAGE, dataSchemas, type Artefact } from './contracts';
import { lookUpQuery, matchAbout, readerArtefacts, researchRank, type SuppliedSource } from './reader-inputs';
import { executeStage } from './pipeline';
import type { Research } from './server/research';

const passage = artefact('passage_0001', 'passage', 'Page 1', 'Family hubs open in every council, funded by the Department for Education and inspected by Ofsted.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });
const traced = { origin: 'extracted_fact' as const, sourceId: passage.id, refs: [passage.id] };
const actor = (id: string, label: string) => artefact(id, 'actor', label, label, { entityType: 'agency', aliases: [], mentions: [], ambiguity: '', dates: [], parent: null }, traced);
const claim = (id: string, label: string) => artefact(id, 'claim', label, label, { category: 'claim', notes: '' }, traced);
const inventory: Artefact[] = [
  passage,
  actor('s2_000_actor_1', 'Ofsted'),
  actor('s2_000_actor_2', 'Department for Education'),
  actor('s1_000_actor_9', 'Ofsted'), // a mention, not a resolved body
  claim('s1_000_claim_1', 'Family hubs'),
  claim('s1_000_claim_2', 'Family hubs funding'),
  claim('s1_000_claim_3', 'Every council opens a hub'),
];

describe('a look-up becomes a query the server builds', () => {
  it('keeps the reader’s words and drops search syntax', () => {
    expect(lookUpQuery('  "Family hubs" evaluation (2024)\n results ')).toEqual({ query: 'Family hubs evaluation 2024 results' });
  });
  it('refuses an address, an email, a phone number, a postcode or an NI number, saying which', () => {
    for (const [wording, what] of [
      ['see https://example.com/x', 'web address'], ['ask jane@example.com', 'email'], ['ring 020 7946 0000 about it', 'phone'],
      ['hubs near SW1A 1AA', 'postcode'], ['case AB 12 34 56 C', 'National Insurance'],
    ]) {
      const built = lookUpQuery(wording);
      expect('refused' in built && built.refused, wording).toMatch(new RegExp(what));
    }
  });
  it('refuses nothing and too much', () => {
    expect(lookUpQuery('   ')).toMatchObject({ refused: expect.any(String) });
    expect(lookUpQuery('x'.repeat(301))).toMatchObject({ refused: expect.stringMatching(/longer/) });
  });
});

describe('“about” is matched against the items a reader can see', () => {
  it('an exact label wins outright, resolved bodies only', () => {
    expect(matchAbout('ofsted', inventory)).toEqual(['s2_000_actor_1']);
  });
  it('whole words either way, shortest first, three at most', () => {
    expect(matchAbout('family hubs', inventory)).toEqual(['s1_000_claim_1']);
    expect(matchAbout('hubs', inventory)).toEqual(['s1_000_claim_1', 's1_000_claim_2']);
    expect(matchAbout('the Department for Education budget', inventory)).toEqual(['s2_000_actor_2']);
  });
  it('matches nothing for a topic the items do not name, or for a word too short to mean anything', () => {
    expect(matchAbout('workforce shortages', inventory)).toEqual([]);
    expect(matchAbout('hub', inventory)).toEqual([]);
    expect(matchAbout(null, inventory)).toEqual([]);
  });
});

const page: SuppliedSource = { form: 'page', url: 'https://www.gov.uk/review', title: 'Capacity review', text: 'Councils reported vacancies. '.repeat(20), failure: null, about: 'Ofsted', note: 'The 2025 review.' };
const unread: SuppliedSource = { form: 'page', url: 'https://fail.example/x', title: 'fail.example', text: null, failure: 'the page could not be reached', about: 'workforce', note: null };

describe('what stage 5 mints from it', () => {
  const minted = readerArtefacts(5, [page, unread], [{ wording: 'Family hubs evaluation', query: 'Family hubs evaluation' }], inventory, new Date('2026-10-01T00:00:00Z'));

  it('a reader question per look-up, asked and searched', () => {
    expect(minted.searched.map((q) => q.id)).toEqual(['s5_reader_lookup_01']);
    expect(minted.searched[0].data).toMatchObject({ asked: 'reader', priority: 1, searchStrategy: 'Family hubs evaluation', wording: 'Family hubs evaluation' });
  });

  it('a question per supplied source, never searched, and a source graded on what it is', () => {
    expect(minted.questions.map((q) => q.id)).toEqual(['s5_reader_lookup_01', 's5_reader_source_01', 's5_reader_source_02']);
    const [source] = minted.sources;
    expect(source).toMatchObject({ kind: 'research_source', url: 'https://www.gov.uk/review', origin: 'external_evidence', refs: ['s5_reader_source_01'] });
    // Supplied says WHO; retrieval says how much was read; quality is the domain's, as for any source.
    expect(source.data).toMatchObject({ supplied: 'reader', suppliedAs: 'page', retrieval: 'full_text', quality: 'government', about: 'Ofsted', aboutIds: ['s2_000_actor_1'], note: 'The 2025 review.' });
  });

  it('a source that could not be read is listed with its reason, and mints no source', () => {
    expect(minted.sources).toHaveLength(1);
    expect(minted.questions[2].data.gap).toMatch(/could not be reached/);
    expect(minted.warnings.join(' ')).toMatch(/could not be read: the page could not be reached/);
  });

  it('every minted row satisfies the contract, new fields included', () => {
    for (const a of [...minted.questions, ...minted.sources]) {
      const parsed = dataSchemas[a.kind as 'research_question' | 'research_source'].safeParse(a.data);
      expect(parsed.success, `${a.id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      // Nothing the schema would strip: the new fields are in the shape.
      expect(parsed.success && parsed.data).toEqual(a.data);
    }
  });

  it('ranks every reader question above every model question', () => {
    const model = artefact('s5_000_q', 'research_question', 'm', 'm', { importance: 1, uncertainty: 1, consequence: 1, priority: 1, rationale: 'r', searchStrategy: 's', gap: 'g' });
    expect(researchRank(minted.searched[0])).toBeGreaterThan(researchRank(model));
    expect([model, minted.searched[0]].sort((a, b) => researchRank(b) - researchRank(a))[0].id).toBe('s5_reader_lookup_01');
  });
});

describe('the research step, with a reader’s sources and look-ups', () => {
  const planned = (input: unknown) => {
    const { idPrefix } = input as { idPrefix: string };
    return { artefacts: [artefact(`${idPrefix}q`, 'research_question', 'Model question', 'q', { importance: 1, uncertainty: 1, consequence: 1, rationale: 'r', searchStrategy: 'council capacity evaluation', gap: 'g' }, { refs: ['s1_000_claim_1'] })], warnings: [] };
  };

  it('asks the look-up first, keeps the supplied source, and strips a model’s attempt to pass as the reader', async () => {
    const asked: string[] = [];
    const research: Research = async (questions) => { asked.push(...questions.map((q) => q.id)); return { artefacts: [], warnings: [] }; };
    const result = await executeStage(
      { stage: 5, title: 't', jurisdiction: null, policyArea: null, context: null, artefacts: inventory },
      {
        model: async (_stage, _key, input) => {
          const out = planned(input);
          // A model claiming to be the reader is demoted to itself.
          out.artefacts[0].data.asked = 'reader';
          return out;
        },
        research, signal: new AbortController().signal,
        reader: { supplied: [page], lookUps: [{ wording: 'Family hubs evaluation', query: 'Family hubs evaluation' }] },
      },
    );
    expect(asked[0]).toBe('s5_reader_lookup_01');
    expect(asked).not.toContain('s5_reader_source_01');
    const model = result.artefacts.find((a) => a.kind === 'research_question' && !a.id.includes('reader'))!;
    expect(model.data.asked).toBeUndefined();
    expect(result.artefacts.some((a) => a.kind === 'research_source' && a.data.supplied === 'reader')).toBe(true);
  });
});

describe('the supplied-balance remit runs only where there is something to balance', () => {
  const supplied = artefact('source_x', 'research_source', 's', 's', { questionId: 'q', supplied: 'reader' });

  it('is skipped on a run with no supplied source, and asked on one with', () => {
    expect(assuranceCategories(inventory)).not.toContain('supplied_balance');
    expect(assuranceCategories(inventory)).toHaveLength(ASSURANCE_CATEGORIES.length - 1);
    expect(assuranceCategories([...inventory, supplied])).toEqual([...ASSURANCE_CATEGORIES]);
  });

  it('is not fanned out, nor counted missing, when skipped', async () => {
    const finding = artefact('s12_000_finding', 'finding', 'f', 'f', { section: 'mechanisms', resultIds: [], hypothesisIds: [], revision: 'initial' }, { refs: ['s1_000_claim_1'] });
    const asked: string[] = [];
    const run = (artefacts: Artefact[]) => executeStage(
      { stage: ASSURANCE_STAGE, title: 't', jurisdiction: null, policyArea: null, context: null, artefacts },
      {
        model: async (_stage, _key, input) => {
          const { idPrefix, targetCategory } = input as { idPrefix: string; targetCategory: string };
          asked.push(targetCategory);
          return { artefacts: [artefact(`${idPrefix}c`, 'assurance_challenge', 'c', 'c', { category: targetCategory, finding: 'cleared', materiality: 'low', targetIds: [finding.id], challenge: 'c', testApplied: 't', evidence: 'e', resolutionNeeded: 'r', ...(targetCategory === 'rival_explanation' ? { rival: 'r', discriminators: ['d'] } : {}) }, { refs: [finding.id] })], warnings: [] };
        },
        research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal,
      },
    );
    const without = await run([...inventory, finding]);
    expect(asked).not.toContain('supplied_balance');
    expect(without.warnings.join(' ')).not.toMatch(/supplied balance/);
    asked.length = 0;
    await run([...inventory, finding, supplied]);
    expect(asked).toContain('supplied_balance');
  });
});
