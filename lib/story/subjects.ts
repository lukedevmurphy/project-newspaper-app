// Story subjects — a curated allowlist, NOT a data flag. ~19 people
// carry is_book_subject: true in people.yaml (including non-family
// figures core to the story arc, like the 1846 famine victims), and
// family-confidence flags would exclude Patrick (held at 10 pending
// the Hyp A / Hyp B parentage question). The storyboard is for the
// book's two protagonists; add more IDs here deliberately.

import type { Archive, PersonRecord } from '@/lib/data';

export const STORY_SUBJECT_IDS = [
  'person_james_murphy_son_of_pat_and_ellen',   // James J. Murphy — the user's great-grandfather
  'person_patrick_j_murphy_bartender_1908',     // Patrick Murphy — James's father
] as const;

export function getStorySubjects(archive: Archive): PersonRecord[] {
  const subjects: PersonRecord[] = [];
  for (const id of STORY_SUBJECT_IDS) {
    const person = archive.peopleById.get(id);
    if (!person) {
      // A data-repo rename must not 500 the build — warn and skip.
      console.warn(`[story] subject id not found in people.yaml: ${id}`);
      continue;
    }
    subjects.push(person);
  }
  return subjects;
}

export function isStorySubject(personId: string): boolean {
  return (STORY_SUBJECT_IDS as readonly string[]).includes(personId);
}
