// The three places this feature could leak or be led by the nose.
import { describe, expect, it } from 'vitest';
import { artefact, SYNTHESIS_STAGE, type Artefact } from './contracts';
import { documentShingles, quotesDocument } from './query-guard';
import { executeStage } from './pipeline';
import { safeSourceUrl } from './contracts';
import { readSubmission } from './server/ingest';

const text = `Subject to the Bill being passed by Parliament, and Government issuing the relevant
Directions, we will consult on the new standards by the summer of 2023. These may be subject to
further change as we continue to engage with tenants and landlords.`;
const passage = artefact('passage_0001', 'passage', 'Page 9', text, { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, startOffset: 0, endOffset: text.length });

describe('the document does not reach the search provider', () => {
  const corpus = documentShingles([passage]);

  it('refuses a query that reproduces a run of the paper', () => {
    expect(quotesDocument('we will consult on the new standards by the summer of 2023', corpus)).toBe(true);
    expect(quotesDocument('subject to the bill being passed by parliament', corpus)).toBe(true);
  });

  it('allows an ordinary public query about the same subject', () => {
    expect(quotesDocument('social housing consumer standards consultation timetable', corpus)).toBe(false);
    expect(quotesDocument('Regulator of Social Housing enforcement powers evidence', corpus)).toBe(false);
  });

  it('does nothing when there is no document to protect', () => {
    expect(quotesDocument('anything at all here', new Set())).toBe(false);
  });

  it('drops the question rather than the run when a query would quote', async () => {
    const assumption = artefact('s1_0_assumption', 'assumption', 'Timetable holds', 'The consultation timetable is assumed to hold.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'Untested.' }, { refs: ['passage_0001', 's1_0_mechanism'] });
    const mechanism = artefact('s1_0_mechanism', 'mechanism', 'Consultation', 'A consultation is promised.', { intervention: 'Consultation', implementation: 'RSH', notes: 'No date fixed.' }, { refs: ['passage_0001'], origin: 'extracted_fact', sourceId: 'passage_0001', sourceQuote: 'we will consult on the new standards' });
    const model = async (_stage: number, _key: string, raw: unknown) => ({
      artefacts: [artefact(`${(raw as { idPrefix: string }).idPrefix}q`, 'research_question', 'Timetable', 'Will the timetable hold?', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, rationale: 'It gates everything.', searchStrategy: 'we will consult on the new standards by the summer of 2023', gap: 'Unknown.' }, { refs: ['s1_0_assumption'] })],
      warnings: [],
    });
    let searched = 0;
    const research = async () => { searched++; return { artefacts: [], warnings: [] }; };
    const output = await executeStage({ stage: 5, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [passage, mechanism, assumption] }, { model, research, signal: new AbortController().signal });
    expect(searched).toBe(0);
    expect(output.warnings.join(' ')).toContain('quoted the policy document');
  });
});

describe('evidence comes from retrieval, never from the model', () => {
  it('discards a source the model minted, with its URL', async () => {
    const assumption = artefact('s1_0_assumption', 'assumption', 'Capacity', 'Capacity is assumed.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'Untested.' }, { refs: ['passage_0001', 's1_0_mechanism'] });
    const mechanism = artefact('s1_0_mechanism', 'mechanism', 'Duty', 'A duty.', { intervention: 'Duty', implementation: 'RSH', notes: 'None.' }, { refs: ['passage_0001'], origin: 'extracted_fact', sourceId: 'passage_0001', sourceQuote: 'engage with tenants and landlords' });
    const model = async (_stage: number, _key: string, raw: unknown) => {
      const prefix = (raw as { idPrefix: string }).idPrefix;
      return {
        artefacts: [
          artefact(`${prefix}q`, 'research_question', 'Capacity', 'Is there capacity?', { importance: 0.5, uncertainty: 0.5, consequence: 0.5, rationale: 'Capacity gates delivery.', searchStrategy: 'local authority delivery capacity evaluation', gap: 'Unknown.' }, { refs: ['s1_0_assumption'] }),
          artefact(`${prefix}fake`, 'research_source', 'A source I made up', 'Trust me.', { questionId: `${prefix}q`, retrievedAt: '2026-01-01', quality: 'government', qualityBasis: 'n', freshness: 'n', jurisdictionalRelevance: 'n', retrieval: 'full_text', gap: 'n' }, { refs: [`${prefix}q`], origin: 'external_evidence', url: 'https://example.invalid/made-up' }),
        ],
        warnings: [],
      };
    };
    const research = async () => ({ artefacts: [], warnings: [] });
    const output = await executeStage({ stage: 5, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [passage, mechanism, assumption] }, { model, research, signal: new AbortController().signal });
    expect(output.artefacts.filter((a: Artefact) => a.kind === 'research_source')).toEqual([]);
    expect(output.warnings.join(' ')).toContain('model-authored source');
  });
});

describe('a citation URL must be public and plain', () => {
  it('refuses schemes, hosts and credentials that are not', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://127.0.0.1/', 'http://metadata.internal/', 'https://user:pw@public.example/', 'https://strangeramblings.com/admin', 'https://localhost/'])
      expect(safeSourceUrl(url)).toBeNull();
    expect(safeSourceUrl('https://www.gov.uk/guidance')).toBe('https://www.gov.uk/guidance');
  });
});

describe('a stage is shown the assumptions its output must cite', () => {
  it('pins them into the exploitation playbook, whose preconditions name them', async () => {
    // An exploitation play's `preconditions` are assumption records and must also
    // appear in refs. The model can only name an identifier it was shown, and
    // assumptions are produced early, which puts them below the conclusions in
    // the shed order. Seen live on 2026-09-10: the playbook ran with 24 results
    // and ZERO assumptions in context.
    const actor = artefact('s2_actor_1', 'actor', 'A landlord', 'A registered provider.', { mentions: [], role: 'r', notes: 'n' }, { refs: ['passage_0001'] });
    const mechanism = artefact('s1_0_mechanism', 'mechanism', 'Duty', 'A duty.', { intervention: 'Duty', implementation: 'RSH', notes: 'None.' }, { refs: ['passage_0001'], origin: 'extracted_fact', sourceId: 'passage_0001', sourceQuote: 'engage with tenants and landlords' });
    const assumption = artefact('s1_0_assumption', 'assumption', 'Capacity', 'Capacity is assumed.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'Untested.' }, { refs: ['passage_0001', 's1_0_mechanism'] });
    const profile = artefact('s4_000_profile_1', 'profile', 'Landlord profile', 'What moves it.', { actorId: 's2_actor_1' }, { refs: ['passage_0001'] });
    let pinned: string[] = [];
    const model = async (_stage: number, _key: string, raw: unknown) => {
      pinned = ((raw as { protect?: string[] }).protect ?? []).slice();
      return { artefacts: [], warnings: [] };
    };
    await executeStage(
      { stage: 10, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [passage, actor, mechanism, assumption, profile] },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    ).catch(() => null);
    expect(pinned).toContain('s1_0_assumption');
    expect(pinned).toContain('s4_000_profile_1');
  });
});

describe('synthesis is shown the results it is required to cite', () => {
  it('pins every test, model, scenario, exploit and cross-policy exposure into the call', async () => {
    // A finding must cite one of these kinds. They are the last things produced
    // and carry the lowest confidence, so the context budget shed the lot — and
    // the model, still required to cite a result, minted identifiers for results
    // it had never been shown. Every finding was then quarantined for citing an
    // unavailable source and the stage failed naming the missing chapters.
    const results: Artefact[] = [
      artefact('s8_test_1', 'test', 'A test', 'A structural check.', { check: 'c', result: 'fail', detail: 'd', resultIds: [] }, { refs: ['passage_0001'] }),
      artefact('s10_exploit_1', 'exploit', 'A play', 'A play.', { actorId: 's2_a', preconditions: [] }, { refs: ['passage_0001'] }),
      artefact('s9_scenario_1', 'scenario', 'A scenario', 'A scenario.', { scenario: 's', assumptions: [] }, { refs: ['passage_0001'] }),
    ];
    let pinned: string[] = [];
    const model = async (_stage: number, _key: string, raw: unknown) => {
      pinned = ((raw as { protect?: string[] }).protect ?? []).slice();
      return { artefacts: [], warnings: [] };
    };
    await executeStage(
      { stage: SYNTHESIS_STAGE, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [passage, ...results] },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    ).catch(() => null);
    expect(pinned.sort()).toEqual(['s10_exploit_1', 's8_test_1', 's9_scenario_1']);
    // No assumptions in this fixture, so the pin is the results alone.
  });
});

describe('the evidence matrix keeps the claims its output is about', () => {
  it('pins every claim into each question\u2019s call', async () => {
    // Evidence is evidence FOR OR AGAINST a claim, so this is the one stage whose
    // output is about the material the shed order calls superseded. Shed the
    // claims and the model, asked for evidence and shown none of them, emits the
    // claims instead \u2014 three consecutive responses with nothing usable, and a
    // dead stage. Seen live on 2026-09-10 at questions 6, 7 and 8.
    const claim = artefact('s1_0_claim_1', 'claim', 'A claim', 'The paper claims something.', { claimType: 'objective', notes: 'None.' }, { refs: ['passage_0001'], origin: 'extracted_fact', sourceId: 'passage_0001', sourceQuote: 'we will consult on the new standards' });
    const question = artefact('s5_main_q1', 'research_question', 'A question', 'Is it so?', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, rationale: 'It gates everything.', searchStrategy: 'social housing consumer standards', gap: 'Unknown.' }, { refs: ['s1_0_claim_1'] });
    const source = artefact('s5_main_src1', 'research_source', 'A source', 'Retrieved text.', { questionId: 's5_main_q1', retrievedAt: '', quality: '', qualityBasis: '', freshness: '', jurisdictionalRelevance: '', retrieval: 'full_text', gap: '' }, { refs: ['s5_main_q1'], url: 'https://example.org/a' });
    let pinned: string[] = [];
    const model = async (_stage: number, _key: string, raw: unknown) => {
      pinned = ((raw as { protect?: string[] }).protect ?? []).slice();
      return { artefacts: [], warnings: [] };
    };
    await executeStage(
      { stage: 6, title: 'A policy', jurisdiction: null, policyArea: null, context: null, artefacts: [passage, claim, question, source] },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    ).catch(() => null);
    expect(pinned).toContain('s1_0_claim_1');
  });
});


/**
 * PERMISSION TO SEARCH A SEALED PAPER HAS TO BE ASKED FOR.
 *
 * Sealing switches off three things. Two of them — cross-policy comparison and
 * the persona library — write this paper's substance into rows that OUTLIVE the
 * run, where shredding its key can never reach, so neither is offered and no
 * field turns them on. The third, external search, puts the TOPIC of an
 * unpublished paper into a third party's logs: a real exposure, outside the
 * guarantee rather than a hole in it, and therefore the reader's to weigh.
 *
 * Which makes the parse the whole safety story. A sealed run that searched when
 * nobody said it could is the failure that matters, so the field reads the same
 * way round as `sealed` does — the exact string or nothing — and it cannot grant
 * itself permission on an unsealed submission, where it means nothing.
 */
describe('a sealed run searches only when the reader asked it to', () => {
  const submit = (fields: Record<string, string>) => {
    const form = new FormData();
    form.set('title', 'A paper');
    form.set('text', 'Some policy prose that is comfortably long enough to be ingested at all.');
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return readSubmission(new Request('http://localhost/api/policy-analysis', { method: 'POST', body: form }));
  };

  it('grants it only on the exact string, on a sealed run', async () => {
    expect((await submit({ sealed: 'true', sealedResearch: 'true' })).sealedResearch).toBe(true);
    expect((await submit({ sealed: 'true', sealedResearch: 'false' })).sealedResearch).toBe(false);
    // The field absent altogether is the case a form change or a stale client
    // produces, and it has to land on the value that leaks less.
    expect((await submit({ sealed: 'true' })).sealedResearch).toBe(false);
    // Anything that is not the string is not consent, however keen it looks.
    for (const v of ['TRUE', 'yes', '1', 'on', '']) {
      expect((await submit({ sealed: 'true', sealedResearch: v })).sealedResearch, v).toBe(false);
    }
  });

  it('reads exactly the way the seal itself does', async () => {
    // Both fields go through the same shared `str`, which trims — so ' true' is
    // consent here for precisely the reason it is consent for `sealed`, and the
    // two must not drift apart. Pinning them together is worth more than pinning
    // either alone: the danger is one of them quietly gaining a looser reading.
    for (const v of ['true', ' true ', 'TRUE', 'yes', '1', '']) {
      const run = await submit({ sealed: v, sealedResearch: v });
      expect(run.sealedResearch, v).toBe(run.sealed);
    }
  });

  it('never records it on an unsealed run, which needs no permission', async () => {
    // Storing true here would read as "this run was granted something", when an
    // unsealed run simply always searches. A later reader must not have to work
    // out which kind of true they are looking at.
    const open = await submit({ sealed: 'false', sealedResearch: 'true' });
    expect(open.sealed).toBe(false);
    expect(open.sealedResearch).toBe(false);
  });
});
