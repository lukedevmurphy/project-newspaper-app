// The nexus — an interactive web of the people around James and
// Patrick Murphy and the primary sources connecting them. The graph is
// assembled server-side at build (lib/nexus/graph.ts); only the
// explorer component itself runs client JS.

import { loadArchive } from '@/lib/data';
import { buildNexusGraph } from '@/lib/nexus/graph';
import { NexusExplorer } from '@/components/nexus-explorer';

export const metadata = { title: 'Nexus' };

export default function NexusPage() {
  const archive = loadArchive();
  const graph = buildNexusGraph(archive);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-stone-900">Nexus</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">
          The web around James J. Murphy and his father Patrick — every line is backed by the
          primary sources shown when you click a person. {graph.nodes.length} people,{' '}
          {graph.edges.length} connections.
        </p>
      </header>
      <NexusExplorer graph={graph} />
    </main>
  );
}
