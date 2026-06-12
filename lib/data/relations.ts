// Bidirectional relationship inference. people.yaml declares directed
// edges only (A child_of B); the indexer uses this map to surface the
// inverse on the target's page (B parent_of A) without requiring the
// data repo to double-declare.
//
// Inverses are deliberately gender-neutral: from "A son_of B" we know B
// is A's parent, not whether B is father or mother. Relations with no
// safe inverse (attorney_of, candidate_son_of_hyp_a…) are NEVER given
// an invented one — they surface as an "inverted listing" instead
// ("listed as attorney of this person by X"), so hypothesis and
// professional relations are reported, not asserted.

import type { PersonRecord } from './types';

const INVERSE_RELATION: Record<string, string> = {
  child_of: 'parent_of',
  son_of: 'parent_of',
  daughter_of: 'parent_of',
  parent_of: 'child_of',
  father_of: 'child_of',
  mother_of: 'child_of',
  claimed_father_of: 'claimed_child_of',
  married_to: 'married_to',
  sibling_of: 'sibling_of',
  brother_of: 'sibling_of',
  sister_of: 'sibling_of',
  grandfather_of: 'grandchild_of',
  grandmother_of: 'grandchild_of',
  grandparent_of: 'grandchild_of',
  grandson_of: 'grandparent_of',
  granddaughter_of: 'grandparent_of',
  grandchild_of: 'grandparent_of',
  godparent_of: 'godchild_of',
  godchild_of: 'godparent_of',
  uncle_of: 'nephew_or_niece_of',
  aunt_of: 'nephew_or_niece_of',
  nephew_of: 'aunt_or_uncle_of',
  niece_of: 'aunt_or_uncle_of',
  cousin_of: 'cousin_of',
  employer_of: 'employed_by',
  employed_by: 'employer_of',
};

export interface ResolvedRelationship {
  relation: string;       // relation as displayed FROM the subject's perspective
  person: string;         // the other person's id
  inferred: boolean;      // true when derived from the other person's declaration
  inverted?: boolean;     // true when no safe inverse exists — render as a listing, not a claim
  declaredBy: string;     // person id whose YAML entry declares the edge
}

// Builds person id → resolved relationships (declared + inferred).
// Dedupe rule: skip an inferred edge when the subject already declares
// ANY relation back to the same person — many pairs are double-declared
// in the data (177 child_of vs 140 parent_of; married_to mostly mutual).
export function resolveRelationships(people: PersonRecord[]): Map<string, ResolvedRelationship[]> {
  const result = new Map<string, ResolvedRelationship[]>();
  const declaredTargets = new Map<string, Set<string>>();

  for (const person of people) {
    const list: ResolvedRelationship[] = person.relationships.map(rel => ({
      relation: rel.relation,
      person: rel.person,
      inferred: false,
      declaredBy: person.id,
    }));
    result.set(person.id, list);
    declaredTargets.set(person.id, new Set(person.relationships.map(r => r.person)));
  }

  for (const person of people) {
    for (const rel of person.relationships) {
      const target = rel.person;
      if (!result.has(target)) continue;          // unknown person id — skip quietly
      if (declaredTargets.get(target)?.has(person.id)) continue;
      const inverse = INVERSE_RELATION[rel.relation];
      result.get(target)!.push(
        inverse
          ? { relation: inverse, person: person.id, inferred: true, declaredBy: person.id }
          : { relation: rel.relation, person: person.id, inferred: true, inverted: true, declaredBy: person.id }
      );
    }
  }

  return result;
}
