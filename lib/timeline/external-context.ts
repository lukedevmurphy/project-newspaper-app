// Hard-coded external historical context — periods overlaid on the
// timeline when the "Show context" toggle is on. NOT primary-source-
// attributed; these are convenience anchors. Kept short, mostly
// Irish + Irish-American — the arc this archive sits inside.
//
// Add or trim with care: the timeline is most readable with ~10 bands.

export interface ExternalContextPeriod {
  id: string;
  label: string;
  from: string;          // ISO yyyy or yyyy-mm-dd
  to: string;            // open-ended → use a far-future or omit-instant points
  // Visual styling — kept to Tailwind utility classes for consistency
  // with the rest of the app. Each period gets a translucent strip.
  className: string;
}

export const EXTERNAL_CONTEXT: ExternalContextPeriod[] = [
  {
    id: 'great_famine',
    label: 'Great Famine',
    from: '1845',
    to: '1852',
    className: 'bg-rose-200/40 border-rose-400/40',
  },
  {
    id: 'anti_chinese_movement',
    label: 'Anti-Chinese movement (US West Coast)',
    from: '1885',
    to: '1888',
    className: 'bg-amber-200/40 border-amber-400/40',
  },
  {
    id: 'land_war',
    label: 'Land War / Plan of Campaign',
    from: '1879',
    to: '1891',
    className: 'bg-emerald-200/40 border-emerald-400/40',
  },
  {
    id: 'parnell_era',
    label: 'Parnell era',
    from: '1880',
    to: '1891',
    className: 'bg-emerald-100/40 border-emerald-300/40',
  },
  {
    id: 'butte_miners_strike_1903',
    label: 'Butte miners strike (1903)',
    from: '1903',
    to: '1904',
    className: 'bg-zinc-300/40 border-zinc-500/40',
  },
  {
    id: 'wwi',
    label: 'First World War',
    from: '1914',
    to: '1918',
    className: 'bg-sky-200/40 border-sky-400/40',
  },
  {
    id: 'easter_rising',
    label: 'Easter Rising',
    from: '1916-04',
    to: '1916-05',
    className: 'bg-emerald-300/60 border-emerald-600/60',
  },
  {
    id: 'spanish_flu',
    label: 'Spanish flu',
    from: '1918',
    to: '1920',
    className: 'bg-purple-200/40 border-purple-400/40',
  },
  {
    id: 'irish_war_of_independence',
    label: 'Irish War of Independence',
    from: '1919',
    to: '1921',
    className: 'bg-emerald-400/40 border-emerald-600/40',
  },
  {
    id: 'irish_civil_war',
    label: 'Irish Civil War',
    from: '1922',
    to: '1923',
    className: 'bg-emerald-500/40 border-emerald-700/40',
  },
];
