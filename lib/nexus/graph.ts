// Graph assembly for the /nexus explorer. Server-side: walks the
// archive's relationship + co-appearance maps outward from the story
// subjects and emits a serializable graph plus an evidence card per
// cited source. Every edge carries the concrete source IDs that
// justify it — the attribution rule, in graph form.

import { sourceListing } from '@/lib/data/citation';
import { photoUrl } from '@/lib/data/photo-url';
import type { Archive } from '@/lib/data';
import { STORY_SUBJECT_IDS } from '@/lib/story/subjects';

export interface NexusNode {
  id: string;
  name: string;
  fc: number;                 // family_confidence
  isSubject: boolean;
  photo: string | null;
  sourceCount: number;
}

export interface NexusEdge {
  a: string;
  b: string;
  relation?: string;          // displayed from a's perspective ("father of")
  sourceIds: string[];        // shared sources backing the edge
}

export interface EvidenceCard {
  id: string;
  citation: string;
  title: string;
  snippet: string;
  kind: 'clipping' | 'document';
}

export interface NexusGraph {
  nodes: NexusNode[];
  edges: NexusEdge[];
  evidence: Record<string, EvidenceCard>;
}

const NEIGHBORS_PER_SUBJECT = 16;
// Neighbor↔neighbor co-appearance edges need 2+ shared sources to draw
// (subject edges always draw) — keeps the web readable, not a hairball.
const CROSS_EDGE_MIN_SOURCES = 2;

export function buildNexusGraph(archive: Archive): NexusGraph {
  const subjectIds = STORY_SUBJECT_IDS.filter(id => archive.peopleById.has(id));
  const nodeIds = new Set<string>(subjectIds);

  for (const sid of subjectIds) {
    const co = archive.coAppearancesByPersonId.get(sid) ?? new Map<string, string[]>();
    const ranked = [...co.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [otherId] of ranked.slice(0, NEIGHBORS_PER_SUBJECT)) {
      if (archive.peopleById.has(otherId)) nodeIds.add(otherId);
    }
    for (const rel of archive.relationshipsByPersonId.get(sid) ?? []) {
      if (!rel.inverted && archive.peopleById.has(rel.person)) nodeIds.add(rel.person);
    }
  }

  const nodes: NexusNode[] = [...nodeIds].map(id => {
    const p = archive.peopleById.get(id)!;
    const photos = archive.photosByPersonId.get(id) ?? [];
    const photo = photos.find(ph => ph.kind === 'face_crop' || ph.kind === 'portrait') ?? photos[0];
    return {
      id,
      name: p.display_name.split('(')[0].trim(),
      fc: p.family_confidence,
      isSubject: subjectIds.includes(id as (typeof subjectIds)[number]),
      photo: photo ? photoUrl(photo) : null,
      sourceCount: archive.sourcesByPersonId.get(id)?.length ?? 0,
    };
  });

  const ids = nodes.map(n => n.id);
  const edges: NexusEdge[] = [];
  const citedSourceIds = new Set<string>();

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const rel = (archive.relationshipsByPersonId.get(a) ?? [])
        .find(r => r.person === b && !r.inverted);
      const shared = archive.coAppearancesByPersonId.get(a)?.get(b) ?? [];
      const touchesSubject = subjectIds.includes(a as never) || subjectIds.includes(b as never);
      const keep = rel || (shared.length >= (touchesSubject ? 1 : CROSS_EDGE_MIN_SOURCES));
      if (!keep) continue;
      edges.push({
        a,
        b,
        relation: rel?.relation.replace(/_/g, ' '),
        sourceIds: shared,
      });
      shared.forEach(sid => citedSourceIds.add(sid));
    }
  }

  const evidence: Record<string, EvidenceCard> = {};
  for (const sid of citedSourceIds) {
    const src = archive.sourcesById.get(sid);
    if (!src) continue;
    const { title, citation } = sourceListing(src);
    const body = (src.transcription || src.summary || '')
      .replace(/^---[\s\S]*?---/, '')
      .replace(/[#*>`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    evidence[sid] = {
      id: sid,
      citation,
      title,
      snippet: body.slice(0, 240) + (body.length > 240 ? '…' : ''),
      kind: src.type,
    };
  }

  return { nodes, edges, evidence };
}
