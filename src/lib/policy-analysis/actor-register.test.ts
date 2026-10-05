import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import {
  actorKey, ancestry, assemble, capacityOf, classifyMention, fallbackFor, fromModel, isNamedPerson, matchDeterministic, matchName, entryIndex,
  registerTree, splitComposite, wouldCycle, type RegisterEntry, type RegisterView,
} from './actor-register';
import { buildRegisterIndex, type RegisterBody } from './register';

const mention = (id: string, label: string, entityType = 'agency', statement = `${label} is named.`, aliases: string[] = []): Artefact =>
  artefact(id, 'actor', label, statement, { entityType, aliases, mentions: ['passage_0001'], ambiguity: 'none', dates: [], parent: null }, { refs: ['passage_0001'], origin: 'extracted_fact' });

const entry = (id: string, name: string, extra: Partial<RegisterEntry> = {}): RegisterEntry => ({
  id, name, aliases: [], kind: 'organisation', partOf: null, kindOf: null, status: 'confirmed', bodyId: null, whatItIs: null, notActorReason: null, entityType: 'agency', ...extra,
});

const body = (slug: string, name: string, acronym: string | null = null, parents: string[] = []): RegisterBody => ({
  id: `govuk:${slug}`, name, acronym, format: 'Ministerial department', status: 'live', closedStatus: null, closedAt: null,
  parentIds: parents.map((p) => `govuk:${p}`), childIds: [], supersedesIds: [], supersededByIds: [], aliases: acronym ? [acronym] : [], webUrl: null,
});
const bodies = buildRegisterIndex([body('department-for-education', 'Department for Education', 'DfE'), body('ofsted', 'Ofsted')]);

describe('names', () => {
  it('folds case, "the", the government variants and a plural last word', () => {
    expect(actorKey('The Government')).toBe('government');
    expect(actorKey('UK Government')).toBe('government');
    expect(actorKey('Central government')).toBe('government');
    // History, not the actor.
    expect(actorKey('Labour government')).not.toBe('government');
    expect(actorKey('Local authorities')).toBe(actorKey('local authority'));
    expect(actorKey('Childminders')).toBe(actorKey('childminder'));
    expect(actorKey('Jobcentre Plus')).toBe('jobcentre plus');
  });
});

describe('what a mention is', () => {
  it('drops a named private individual, and keeps an office by its title', () => {
    expect(isNamedPerson('Lauren', 'person')).toBe(true);
    expect(isNamedPerson('Alex Armstrong', 'person')).toBe(true);
    expect(isNamedPerson('Secretary of State for Education', 'person')).toBe(false);
    expect(isNamedPerson('Speech therapists', 'person')).toBe(false);
    // A company is not a person, however short its name.
    expect(isNamedPerson('Tiney', 'provider')).toBe(false);
    expect(classifyMention(mention('m', 'Lauren', 'person'))).toEqual({ is: 'not_actor', reason: 'named_person' });
  });

  it('keeps a place, a dataset and an assessment out, and asks about a programme', () => {
    expect(classifyMention(mention('m', 'Lincolnshire', 'geography'))).toEqual({ is: 'not_actor', reason: 'place' });
    expect(classifyMention(mention('m', 'Early Years Foundation Stage Profile assessment', 'concept'))).toEqual({ is: 'not_actor', reason: 'assessment' });
    expect(classifyMention(mention('m', 'Universal Credit', 'programme'))).toEqual({ is: 'unsure', hint: 'programme' });
    // A hub or a service typed as a programme is a body that delivers.
    expect(classifyMention(mention('m', 'Family hubs', 'programme'))).toEqual({ is: 'actor' });
  });

  it('splits a composite on a comma, "and" or "&"', () => {
    expect(splitComposite('Nurseries and childminders')).toEqual(['Nurseries', 'childminders']);
    expect(splitComposite('Schools, nurseries, childminders and colleges')).toEqual(['Schools', 'nurseries', 'childminders', 'colleges']);
    expect(splitComposite('Ofsted')).toBeNull();
  });

  it('reads a capacity off the mention, and says "named only" where it shows none', () => {
    expect(capacityOf('The Department of Education is named as the funder of improvements.')).toBe('funds');
    expect(capacityOf('Ofsted inspects early years settings.')).toBe('regulates');
    expect(capacityOf('Children are the intended beneficiaries of the policy.')).toBe('receives');
    expect(capacityOf('Councils are named as partners in the continuing work.')).toBe('partners');
    expect(capacityOf('Small childcare businesses are affected by new schemes.')).toBe('is_affected');
    expect(capacityOf('Lincolnshire.')).toBe('named_only');
  });
});

describe('deterministic matching', () => {
  const view: RegisterView = {
    entries: [
      entry('dfe', 'Department for Education', { bodyId: 'govuk:department-for-education', partOf: 'gov' }),
      entry('gov', 'Government'),
      entry('eyp', 'Early years providers', { kind: 'sector_or_category', aliases: ['Childcare providers'] }),
      entry('uc', 'Universal Credit', { kind: 'not_an_actor', notActorReason: 'programme', partOf: 'dwp' }),
      entry('parents', 'Parents', { kind: 'group_of_people', status: 'proposed' }),
    ],
    rulings: [],
    bodies,
  };

  it('places by name, alias and the GOV.UK register, and asks about nothing it placed', () => {
    const found = matchDeterministic([
      mention('m1', 'The Government'),
      mention('m2', 'Childcare providers', 'provider'),
      mention('m3', 'DfE', 'agency'),
      mention('m4', 'Parents', 'user_group'),
    ], view);
    expect(found.items).toEqual([]);
    expect(found.resolutions.map((r) => [r.mentionId, r.target, r.basis])).toEqual([
      ['m1', { to: 'existing', id: 'gov' }, 'name'],
      ['m2', { to: 'existing', id: 'eyp' }, 'alias'],
      ['m3', { to: 'existing', id: 'dfe' }, 'register'],
      ['m4', { to: 'existing', id: 'parents' }, 'name'],
    ]);
  });

  it('proposes a body only the GOV.UK register knows under its official name', () => {
    const found = matchDeterministic([mention('m1', 'OFSTED')], { ...view });
    expect(found.items).toEqual([]);
    expect([...found.proposals.values()]).toMatchObject([{ name: 'Ofsted', bodyId: 'govuk:ofsted', kind: 'organisation' }]);
  });

  it('obeys the reader: "the same" sends a name to its row, "not the same" keeps it away', () => {
    const rulings = [
      { personaId: 'eyp', subject: 'name:nurseries', verdict: 'same' as const },
      { personaId: 'gov', subject: 'name:government', verdict: 'different' as const },
    ];
    const index = entryIndex({ ...view, rulings });
    expect(matchName('Nurseries', index)).toMatchObject({ entry: { id: 'eyp' }, basis: 'ruling' });
    expect(matchName('Government', index)).toBeNull();
  });

  it('matches a programme the reader ruled not an actor, and never asks about it again', () => {
    const found = matchDeterministic([mention('m1', 'Universal Credit', 'programme')], view);
    expect(found.items).toEqual([]);
    expect(found.resolutions[0]).toMatchObject({ target: { to: 'existing', id: 'uc' }, notActor: 'programme' });
  });

  it('groups identical names in ONE paper into one item for the model', () => {
    const found = matchDeterministic([mention('m1', 'Local nurseries', 'provider'), mention('m2', 'local nurseries', 'provider'), mention('m3', 'Health visitors', 'provider')], view);
    expect(found.items.map((i) => i.mentions)).toEqual([['m1', 'm2'], ['m3']]);
  });

  it('drops a named person before the model or the register sees it, and counts it without naming it', () => {
    const found = matchDeterministic([mention('m1', 'Lauren', 'person', 'Lauren is a first-time mother.')], view);
    expect(found.people).toBe(1);
    expect(found.items).toEqual([]);
    const built = assemble([mention('m1', 'Lauren', 'person')], found.resolutions, found.proposals, view);
    expect(built.actors).toEqual([]);
    expect(JSON.stringify(built)).not.toContain('Lauren');
  });

  it('splits a composite only where every part is already named', () => {
    const named = matchDeterministic([mention('m1', 'Early years providers and parents', 'provider')], view);
    expect(named.items).toEqual([]);
    expect(named.resolutions.map((r) => r.target)).toEqual([{ to: 'existing', id: 'eyp' }, { to: 'existing', id: 'parents' }]);
    const unknown = matchDeterministic([mention('m1', 'Nurseries and childminders', 'provider')], view);
    expect(unknown.items).toMatchObject([{ hint: 'composite', parts: ['Nurseries', 'childminders'] }]);
  });
});

describe('the tree the model is shown', () => {
  const entries = [entry('b', 'Department for Education', { partOf: 'a' }), entry('a', 'Government'), entry('c', 'Universal Credit', { kind: 'not_an_actor', notActorReason: 'programme' })];

  it('is one line per actor, short ids, the same bytes for the same list', () => {
    const one = registerTree(entries, []);
    const two = registerTree([...entries].reverse(), []);
    expect(one.text).toBe(two.text);
    expect(one.text.split('\n')).toEqual([
      'r1 Department for Education [organisation]; part of r2',
      'r2 Government [organisation]',
      'r3 Universal Credit [not an actor: programme]',
    ]);
    expect(one.refs.get('r2')).toEqual({ to: 'existing', id: 'a' });
  });
});

describe('the model’s answers and the reconciliation', () => {
  const view: RegisterView = { entries: [entry('gov', 'Government'), entry('dfe', 'Department for Education', { partOf: 'gov' })], rulings: [], bodies: null };
  const mentions = [
    mention('m1', 'Early years teachers', 'user_group', 'Early years teachers are targeted by incentives.'),
    mention('m2', 'Early years educators', 'user_group', 'Early years educators provide care.'),
    mention('m3', 'Department for Education', 'department', 'The department funds the plan.'),
    mention('m4', 'the department', 'department', 'The department inspects nothing.'),
    mention('m5', 'Tax-Free Childcare', 'programme', 'Tax-Free Childcare helps parents pay.'),
    mention('m6', 'Childminders', 'provider', 'Childminders provide flexible childcare.'),
  ];
  const byId = new Map(mentions.map((m) => [m.id, m]));
  const answer = (id: string, label: string, data: Record<string, unknown>) => artefact(id, 'actor_match', label, 'x', { capacities: [], partOf: null, kindOf: null, matchId: null, kind: null, whatItIs: null, notActor: null, runBy: null, ...data }, { refs: data.mentions as string[] });

  it('is ONE actor per master actor, whatever the calls said, with every angle kept as a capacity', () => {
    const found = matchDeterministic(mentions, view);
    const tree = registerTree(view.entries, [...found.proposals.values()]);
    const items = found.items;
    const workforce = items.filter((i) => ['Early years teachers', 'Early years educators'].includes(i.said)).flatMap((i) => i.mentions);
    const answers = [
      // Two calls that cannot see each other both say "new" for the workforce.
      answer('a1', 'Early years workforce', { mentions: [workforce[0]], answer: 'new', kind: 'group_of_people' }),
      answer('a2', 'Early years workforce', { mentions: [workforce[1]], answer: 'new', kind: 'group_of_people' }),
      answer('a3', 'Department for Education', { mentions: ['m4'], answer: 'existing', matchId: [...tree.refs].find(([, t]) => t.to === 'existing' && t.id === 'dfe')![0], capacities: [{ mentionId: 'm4', capacity: 'regulates' }] }),
      answer('a4', 'Tax-Free Childcare', { mentions: ['m5'], answer: 'not_actor', notActor: 'programme', runBy: [...tree.refs].find(([, t]) => t.to === 'existing' && t.id === 'gov')![0] }),
      answer('a5', 'Childminders', { mentions: ['m6'], answer: 'new', kind: 'sector_or_category', kindOf: 'Early years providers' }),
      answer('a6', 'Early years providers', { mentions: ['m6'], answer: 'new', kind: 'sector_or_category' }),
    ];
    const read = fromModel(answers, items, tree.refs, view, found.proposals, byId);
    const built = assemble(mentions, [...found.resolutions, ...read.resolutions], found.proposals, view);
    const labels = built.actors.map((a) => a.label);
    expect(labels.filter((l) => l === 'Early years workforce')).toHaveLength(1);
    expect(labels.filter((l) => l === 'Department for Education')).toHaveLength(1);
    expect(labels).not.toContain('Tax-Free Childcare');
    const dfe = built.actors.find((a) => a.label === 'Department for Education')!;
    expect(dfe.data.mentions).toEqual(['m3', 'm4']);
    expect(dfe.data.capacities).toEqual([{ mentionId: 'm3', capacity: 'funds' }, { mentionId: 'm4', capacity: 'regulates' }]);
    expect((dfe.data.master as { partOf: { name: string } }).partOf.name).toBe('Government');
    expect(dfe.data.parent).toBe('Government');
    // The programme is attached to the actor that runs it, which is in this paper only if named.
    const childminders = built.actors.find((a) => a.label === 'Childminders')!;
    expect((childminders.data.master as { kindOf: { name: string } }).kindOf.name).toBe('Early years providers');
    // A composite answered twice: one mention, two actors.
    expect(built.actors.find((a) => a.label === 'Early years providers')!.data.mentions).toEqual(['m6']);
    // Ids are the server's, in the order the paper first names each actor.
    expect(built.actors.map((a) => a.id)).toEqual(built.actors.map((_, i) => `s2_reg_${String(i).padStart(3, '0')}`));
    // The plan proposes the new rows and files every mention.
    expect(built.plan.proposals.map((p) => p.name).sort()).toEqual(['Childminders', 'Early years providers', 'Early years workforce', 'Tax-Free Childcare']);
    expect(built.plan.mentions.length).toBeGreaterThanOrEqual(mentions.length);
  });

  it('drops a named person the model recognised, and ignores an answer about a mention it was not asked', () => {
    const found = matchDeterministic([mention('p1', 'Mrs Patel', 'concept')], view);
    const stray = answer('s', 'Ofsted', { mentions: ['not-asked'], answer: 'new' });
    const read = fromModel([answer('a', 'Mrs Patel', { mentions: ['p1'], answer: 'not_actor', notActor: 'named_person' }), stray], found.items, new Map(), view, found.proposals, new Map([['p1', mention('p1', 'Mrs Patel', 'concept')]]));
    expect(read.people).toBe(1);
    expect(read.resolutions).toEqual([expect.objectContaining({ mentionId: 'p1', target: null, notActor: 'named_person' })]);
  });

  it('keeps an unanswered name as a proposal, and an unanswered programme as not an actor', () => {
    const found = matchDeterministic([mention('x1', 'Health visitors', 'provider'), mention('x2', 'NHS App', 'programme')], view);
    const resolutions = fallbackFor(found.items, new Set(), new Map([['x1', mention('x1', 'Health visitors', 'provider')], ['x2', mention('x2', 'NHS App', 'programme')]]), found.proposals);
    expect(resolutions.map((r) => [r.mentionId, r.notActor, r.basis])).toEqual([['x1', null, 'fallback'], ['x2', 'programme', 'fallback']]);
  });
});

describe('the hierarchy cannot loop', () => {
  const parents = new Map<string, string | null>([['sos', 'dfe'], ['dfe', 'gov'], ['gov', null]]);
  const up = (id: string) => parents.get(id) ?? null;

  it('refuses a parent that already sits under the child', () => {
    expect(wouldCycle('gov', 'sos', up)).toBe(true);
    expect(wouldCycle('gov', 'gov', up)).toBe(true);
    expect(wouldCycle('sos', 'gov', up)).toBe(false);
    expect(wouldCycle('x', null, up)).toBe(false);
  });

  it('refuses a walk that never ends, which is a loop already there', () => {
    const looped = new Map([['a', 'b'], ['b', 'a']]);
    expect(wouldCycle('c', 'a', (id) => looped.get(id) ?? null)).toBe(true);
  });

  it('breaks a loop the run\u2019s own proposals would make, and says so', () => {
    const view: RegisterView = { entries: [], rulings: [], bodies: null };
    const found = matchDeterministic([mention('a', 'Alpha hub', 'agency'), mention('b', 'Beta hub', 'agency')], view);
    const tree = registerTree([], [...found.proposals.values()]);
    const answers = [
      artefact('x', 'actor_match', 'Alpha hub', 'x', { mentions: ['a'], answer: 'new', kind: 'organisation', partOf: 'Beta hub', capacities: [], kindOf: null, matchId: null, whatItIs: null, notActor: null, runBy: null }, { refs: ['a'] }),
      artefact('y', 'actor_match', 'Beta hub', 'x', { mentions: ['b'], answer: 'new', kind: 'organisation', partOf: 'Alpha hub', capacities: [], kindOf: null, matchId: null, whatItIs: null, notActor: null, runBy: null }, { refs: ['b'] }),
    ];
    const byId = new Map([['a', mention('a', 'Alpha hub')], ['b', mention('b', 'Beta hub')]]);
    const read = fromModel(answers, found.items, tree.refs, view, found.proposals, byId);
    const built = assemble([...byId.values()], read.resolutions, found.proposals, view);
    const parentsOf = built.actors.map((a) => (a.data.master as { partOf: { name: string } | null }).partOf?.name ?? null);
    expect(parentsOf.filter(Boolean)).toHaveLength(1);
    expect(built.notes.join(' ')).toMatch(/left out/);
  });

  it('draws the breadcrumb nearest first', () => {
    const names = new Map([['sos', 'Secretary of State'], ['dfe', 'Department for Education'], ['gov', 'Government']]);
    expect(ancestry('sos', up, (id) => names.get(id) ?? null)).toEqual(['Department for Education', 'Government']);
  });
});
