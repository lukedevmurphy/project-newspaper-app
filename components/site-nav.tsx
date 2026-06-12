// Site-wide header navigation — every page gets the same way home and
// the same primary destinations (usability: no page is a dead end).
// Server component, plain links, no client JS.

import Link from 'next/link';

const NAV = [
  { href: '/story', label: 'Story' },
  { href: '/nexus', label: 'Nexus' },
  { href: '/timeline-explorer', label: 'Timeline' },
  { href: '/people', label: 'People' },
  { href: '/sources', label: 'Sources' },
  { href: '/curio', label: 'Curio' },
  { href: '/search', label: 'Search' },
];

export function SiteNav() {
  return (
    <div className="border-b border-amber-200/60 bg-paper/80">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-5 gap-y-1 px-6 py-3 text-sm">
        <Link href="/" className="mr-2 font-semibold tracking-tight text-stone-900 hover:text-amber-900">
          Murphy Family Archive
        </Link>
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="text-stone-600 hover:text-amber-900 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
