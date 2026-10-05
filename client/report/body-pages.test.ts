import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { bodyIndex } from './body-pages';

const actor = (id: string, label: string) => ({ id, kind: 'actor', label, data: {} }) as unknown as Artefact;
const profile = (id: string, actorId: string) => ({ id, kind: 'profile', label: 'p', data: { actorId } }) as unknown as Artefact;

describe('bodyIndex', () => {
  it('maps every actor row sharing the filed actor\'s label, and its profile', () => {
    const artefacts = [actor('s2_a', 'Jobcentre Plus'), actor('s2_b', ' jobcentre  plus '), actor('s2_c', 'Ofsted'), profile('s3_p', 's2_b')];
    const index = bodyIndex([{ actorId: 's2_a', personaId: 'p1', name: 'Jobcentre Plus', sightings: 2 }], artefacts);
    expect(index.get('s2_a')?.personaId).toBe('p1');
    expect(index.get('s2_b')?.personaId).toBe('p1');
    expect(index.get('s3_p')?.personaId).toBe('p1');
    expect(index.has('s2_c')).toBe(false);
  });

  it('prefers the record seen in more papers when two claim one label', () => {
    const artefacts = [actor('s2_a', 'Government'), actor('s2_b', 'Government'), actor('s2_c', 'Government')];
    const index = bodyIndex([
      { actorId: 's2_a', personaId: 'once', name: 'Government', sightings: 1 },
      { actorId: 's2_b', personaId: 'twice', name: 'Government', sightings: 2 },
    ], artefacts);
    expect(index.get('s2_c')?.personaId).toBe('twice');
    expect(index.get('s2_a')?.personaId).toBe('once');
  });

  it('is empty with no personas — the offline pack', () => {
    expect(bodyIndex([], [actor('s2_a', 'X')]).size).toBe(0);
  });
});
