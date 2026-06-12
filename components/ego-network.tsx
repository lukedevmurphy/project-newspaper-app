// Server-rendered SVG ego network: the person at the centre, their
// closest connections on a ring. Solid labeled edges are declared or
// inferred relationships; dashed edges are co-appearances, weighted by
// the number of shared sources. Pure trigonometry — no client JS, no
// D3 (the global force-graph stays deferred per ROADMAP).

import type { Archive, PersonRecord } from '@/lib/data';

const MAX_NEIGHBORS = 12;
const W = 640;
const H = 400;
const CX = W / 2;
const CY = H / 2;
const RX = 240;
const RY = 140;

interface Neighbor {
  id: string;
  name: string;
  relation?: string;       // displayed on the edge when present
  sharedCount: number;
}

export function EgoNetwork({ person, archive }: { person: PersonRecord; archive: Archive }) {
  const relationships = archive.relationshipsByPersonId.get(person.id) ?? [];
  const co = archive.coAppearancesByPersonId.get(person.id) ?? new Map<string, string[]>();

  const byId = new Map<string, Neighbor>();
  for (const rel of relationships) {
    if (rel.inverted) continue; // listings, not asserted relations
    if (byId.has(rel.person)) continue;
    byId.set(rel.person, {
      id: rel.person,
      name: shortName(archive.peopleById.get(rel.person)?.display_name ?? rel.person),
      relation: rel.relation.replace(/_/g, ' '),
      sharedCount: co.get(rel.person)?.length ?? 0,
    });
  }
  for (const [otherId, sourceIds] of co.entries()) {
    if (byId.has(otherId)) continue;
    byId.set(otherId, {
      id: otherId,
      name: shortName(archive.peopleById.get(otherId)?.display_name ?? otherId),
      sharedCount: sourceIds.length,
    });
  }

  // Relationship edges first, then by shared-source weight.
  const neighbors = [...byId.values()]
    .sort((a, b) => Number(!!b.relation) - Number(!!a.relation) || b.sharedCount - a.sharedCount)
    .slice(0, MAX_NEIGHBORS);

  if (neighbors.length === 0) return null;

  const positioned = neighbors.map((n, i) => {
    const angle = (2 * Math.PI * i) / neighbors.length - Math.PI / 2;
    return { ...n, x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
  });

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
        Nexus
      </h2>
      <p className="mb-2 text-xs text-stone-500">
        Solid edges: declared/inferred relationships. Dashed edges: appear together in sources
        (thicker = more shared sources). Click a name to open that person.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Connections of ${person.display_name}`}>
        {positioned.map(n => (
          <g key={`edge-${n.id}`}>
            <line
              x1={CX}
              y1={CY}
              x2={n.x}
              y2={n.y}
              stroke={n.relation ? '#52525b' : '#a1a1aa'}
              strokeWidth={n.relation ? 1.5 : Math.min(1 + n.sharedCount * 0.5, 4)}
              strokeDasharray={n.relation ? undefined : '4 3'}
            />
            {n.relation && (
              <text
                x={(CX + n.x) / 2}
                y={(CY + n.y) / 2 - 4}
                textAnchor="middle"
                className="fill-stone-500"
                fontSize="9"
              >
                {n.relation}
              </text>
            )}
            {!n.relation && n.sharedCount > 0 && (
              <text
                x={(CX + n.x) / 2}
                y={(CY + n.y) / 2 - 4}
                textAnchor="middle"
                className="fill-stone-400"
                fontSize="9"
              >
                ×{n.sharedCount}
              </text>
            )}
          </g>
        ))}

        {positioned.map(n => (
          <a key={`node-${n.id}`} href={`/people/${n.id}`}>
            <circle cx={n.x} cy={n.y} r={5} className="fill-stone-400 hover:fill-stone-700" />
            <text
              x={n.x}
              y={n.y + (n.y >= CY ? 18 : -10)}
              textAnchor="middle"
              fontSize="11"
              className="fill-stone-700 hover:underline"
            >
              {n.name}
            </text>
          </a>
        ))}

        <circle cx={CX} cy={CY} r={7} className="fill-emerald-700" />
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-stone-900">
          {shortName(person.display_name)}
        </text>
      </svg>
    </section>
  );
}

// Display names in the registry carry parenthetical disambiguation —
// too long for node labels.
function shortName(display: string): string {
  const base = display.split('(')[0].trim();
  return base.length > 26 ? base.slice(0, 25) + '…' : base;
}
