'use client';

// Interactive nexus explorer — the one deliberately client-side view
// in the app. Drag people around, scroll to zoom, drag the canvas to
// pan; click a person to open their evidence panel: every connection
// rendered as paper-cutout source excerpts (real page-image crops slot
// into these cards once the R2 image bucket is configured).
//
// The force layout is a tiny purpose-built simulation (repulsion +
// edge springs + gentle centering) — no D3 dependency.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { EvidenceCard, NexusEdge, NexusGraph, NexusNode } from '@/lib/nexus/graph';

const W = 1100;
const H = 700;

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

function initPositions(nodes: NexusNode[]): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  const subjects = nodes.filter(n => n.isSubject);
  const others = nodes.filter(n => !n.isSubject);
  subjects.forEach((n, i) => {
    pos.set(n.id, {
      x: W / 2 + (subjects.length > 1 ? (i === 0 ? -180 : 180) : 0),
      y: H / 2,
      vx: 0,
      vy: 0,
      pinned: false,
    });
  });
  others.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(others.length, 1);
    // Deterministic ring start; the simulation swirls them from here.
    const r = 230 + (i % 3) * 45;
    pos.set(n.id, {
      x: W / 2 + r * Math.cos(angle),
      y: H / 2 + r * Math.sin(angle) * 0.78,
      vx: 0,
      vy: 0,
      pinned: false,
    });
  });
  return pos;
}

function tick(nodes: NexusNode[], edges: NexusEdge[], pos: Map<string, Pos>, heat: number) {
  // Pairwise repulsion.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pos.get(nodes[i].id)!;
      const b = pos.get(nodes[j].id)!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const d2 = Math.max(dx * dx + dy * dy, 64);
      const d = Math.sqrt(d2);
      const f = (5200 / d2) * heat;
      dx /= d;
      dy /= d;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
  }
  // Edge springs — heavier edges pull tighter.
  for (const e of edges) {
    const a = pos.get(e.a);
    const b = pos.get(e.b);
    if (!a || !b) continue;
    const rest = e.relation ? 130 : Math.max(150, 240 - e.sourceIds.length * 18);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const f = ((d - rest) / d) * 0.012 * heat * (e.relation ? 2.2 : 1 + Math.min(e.sourceIds.length, 6) * 0.25);
    dx *= f;
    dy *= f;
    a.vx += dx;
    a.vy += dy;
    b.vx -= dx;
    b.vy -= dy;
  }
  // Gentle centering + integrate.
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    if (p.pinned) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    p.vx += (W / 2 - p.x) * 0.0012 * heat;
    p.vy += (H / 2 - p.y) * 0.0018 * heat;
    p.vx *= 0.82;
    p.vy *= 0.82;
    p.x += p.vx;
    p.y += p.vy;
  }
}

export function NexusExplorer({ graph }: { graph: NexusGraph }) {
  const { nodes, edges, evidence } = graph;
  const [positions, setPositions] = useState<Map<string, Pos>>(() => initPositions(nodes));
  const [selected, setSelected] = useState<string | null>(
    nodes.find(n => n.isSubject)?.id ?? null
  );
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });

  const posRef = useRef(positions);
  const heatRef = useRef(1);
  const dragRef = useRef<{ kind: 'node' | 'pan'; id?: string; lastX: number; lastY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Simulation loop — runs while there's heat; dragging re-heats.
  useEffect(() => {
    let raf = 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      for (let i = 0; i < 400; i++) tick(nodes, edges, posRef.current, Math.max(0.05, 1 - i / 400));
      setPositions(new Map(posRef.current));
      return;
    }
    const loop = () => {
      if (heatRef.current > 0.02) {
        tick(nodes, edges, posRef.current, heatRef.current);
        heatRef.current *= 0.985;
        setPositions(new Map(posRef.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toGraphCoords = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };

  const onPointerDown = (e: React.PointerEvent, nodeId?: string) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { kind: nodeId ? 'node' : 'pan', id: nodeId, lastX: e.clientX, lastY: e.clientY };
    if (nodeId) {
      const p = posRef.current.get(nodeId);
      if (p) p.pinned = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'node' && drag.id) {
      const { x, y } = toGraphCoords(e.clientX, e.clientY);
      const p = posRef.current.get(drag.id);
      if (p) {
        p.x = x;
        p.y = y;
        heatRef.current = Math.max(heatRef.current, 0.45); // swirl neighbors
        setPositions(new Map(posRef.current));
      }
    } else {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - drag.lastX) / rect.width) * W;
      const dy = ((e.clientY - drag.lastY) / rect.height) * H;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === 'node' && drag.id) {
      const p = posRef.current.get(drag.id);
      if (p) p.pinned = false;
    }
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    setView(v => {
      const k = Math.min(3.5, Math.max(0.35, v.k * factor));
      // Zoom toward the cursor.
      return { k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k };
    });
  };

  const selectedNode = nodes.find(n => n.id === selected) ?? null;
  const selectedEdges = useMemo(
    () =>
      edges
        .filter(e => e.a === selected || e.b === selected)
        .sort((a, b) => b.sourceIds.length - a.sourceIds.length),
    [edges, selected]
  );
  const connectedIds = useMemo(
    () => new Set(selectedEdges.flatMap(e => [e.a, e.b])),
    [selectedEdges]
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[60vh] w-full touch-none rounded-lg border border-amber-200/70 bg-paper lg:h-[78vh]"
          onPointerDown={e => onPointerDown(e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label="Interactive map of people and their shared sources"
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e, i) => {
              const a = positions.get(e.a);
              const b = positions.get(e.b);
              if (!a || !b) return null;
              const active = selected !== null && (e.a === selected || e.b === selected);
              return (
                <g key={i}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={e.relation ? '#a16207' : '#a8a29e'}
                    strokeOpacity={active ? 0.85 : selected ? 0.15 : 0.45}
                    strokeWidth={e.relation ? 1.6 : Math.min(1 + e.sourceIds.length * 0.45, 4.5)}
                    strokeDasharray={e.relation ? undefined : '5 4'}
                  />
                  {e.relation && active && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 5}
                      textAnchor="middle"
                      fontSize="10"
                      className="pointer-events-none fill-amber-800"
                    >
                      {e.relation}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map(n => {
              const p = positions.get(n.id);
              if (!p) return null;
              const r = n.isSubject ? 26 : 11 + Math.min(n.sourceCount, 30) * 0.3;
              const isSelected = selected === n.id;
              const dimmed = selected !== null && !isSelected && !connectedIds.has(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  opacity={dimmed ? 0.3 : 1}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={e => {
                    e.stopPropagation();
                    onPointerDown(e, n.id);
                  }}
                  onClick={() => setSelected(n.id)}
                >
                  <circle
                    r={r}
                    fill={n.isSubject ? '#fde68a' : '#f0e7d8'}
                    stroke={isSelected ? '#b45309' : n.isSubject ? '#d97706' : '#c8b896'}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  {n.isSubject && (
                    // Blank-person iconography inside subject nodes;
                    // replaced by the face crop when the bucket is live.
                    n.photo ? (
                      <image
                        href={n.photo}
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        clipPath="circle()"
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <g className="pointer-events-none" opacity={0.75}>
                        <circle cy={-r * 0.25} r={r * 0.32} fill="#a16207" />
                        <path
                          d={`M ${-r * 0.62} ${r * 0.8} a ${r * 0.62} ${r * 0.62} 0 0 1 ${r * 1.24} 0 Z`}
                          fill="#a16207"
                        />
                      </g>
                    )
                  )}
                  {/* Label is part of the node's hit target — clicking a
                      name must select the person, not pan the canvas. */}
                  <text
                    y={r + 13}
                    textAnchor="middle"
                    fontSize={n.isSubject ? 13 : 11}
                    fontWeight={n.isSubject ? 600 : 400}
                    className="fill-stone-700 select-none"
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        <p className="mt-2 text-xs text-stone-500">
          Drag people to rearrange the web · drag the background to pan · scroll to zoom · click a
          person to see the evidence connecting them. Solid amber lines are family relationships;
          dashed lines are shared appearances in sources (thicker = more sources).
        </p>
      </div>

      <aside className="w-full shrink-0 lg:w-96">
        {selectedNode ? (
          <EvidencePanel
            node={selectedNode}
            edges={selectedEdges}
            nodes={nodes}
            evidence={evidence}
          />
        ) : (
          <p className="text-sm text-stone-500">Click a person in the web to see their evidence.</p>
        )}
      </aside>
    </div>
  );
}

function EvidencePanel({
  node,
  edges,
  nodes,
  evidence,
}: {
  node: NexusNode;
  edges: NexusEdge[];
  nodes: NexusNode[];
  evidence: Record<string, EvidenceCard>;
}) {
  const nameOf = (id: string) => nodes.find(n => n.id === id)?.name ?? id;
  return (
    <div className="max-h-[78vh] overflow-y-auto pr-1">
      <h2 className="text-lg font-semibold text-stone-900">{node.name}</h2>
      <p className="mt-0.5 text-xs text-stone-500">
        {node.sourceCount} sources in the archive · family confidence {node.fc} ·{' '}
        <Link href={`/people/${node.id}`} className="text-amber-800 hover:underline">
          person record →
        </Link>
      </p>

      <div className="mt-4 space-y-5">
        {edges.map((e, i) => {
          const otherId = e.a === node.id ? e.b : e.a;
          return (
            <section key={i}>
              <h3 className="text-sm font-medium text-stone-800">
                {e.relation && e.a === node.id && <span className="text-amber-800">{e.relation} </span>}
                <Link href={`/people/${otherId}`} className="hover:underline">
                  {nameOf(otherId)}
                </Link>
                {e.relation && e.a !== node.id && (
                  <span className="text-amber-800"> ({nameOf(otherId)} is {e.relation} this person)</span>
                )}
                {e.sourceIds.length > 0 && (
                  <span className="ml-1 text-xs font-normal text-stone-500">
                    — together in {e.sourceIds.length} source{e.sourceIds.length === 1 ? '' : 's'}
                  </span>
                )}
              </h3>
              <div className="mt-2 space-y-3">
                {e.sourceIds.slice(0, 4).map((sid, j) => {
                  const card = evidence[sid];
                  if (!card) return null;
                  return (
                    <Link
                      key={sid}
                      href={`/sources/${sid}`}
                      className={`paper-cutout block p-3 transition-transform hover:-translate-y-0.5 ${j % 2 ? 'rotate-[0.4deg]' : '-rotate-[0.4deg]'}`}
                    >
                      <p className="text-[11px] uppercase tracking-wide text-stone-400">
                        {card.kind === 'document' ? 'official record' : 'newspaper'} · {card.citation}
                      </p>
                      {card.title && (
                        <p className="mt-0.5 font-serif text-sm font-semibold leading-snug text-stone-900">
                          {card.title}
                        </p>
                      )}
                      <p className="mt-1 font-serif text-xs leading-5 text-stone-600">
                        {card.snippet}
                      </p>
                    </Link>
                  );
                })}
                {e.sourceIds.length > 4 && (
                  <p className="text-xs text-stone-500">
                    …and {e.sourceIds.length - 4} more shared source{e.sourceIds.length - 4 === 1 ? '' : 's'} on the
                    person page.
                  </p>
                )}
                {e.sourceIds.length === 0 && e.relation && (
                  <p className="text-xs text-stone-500">
                    Declared relationship — no shared source in the archive yet.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
