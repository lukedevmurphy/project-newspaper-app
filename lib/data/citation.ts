// Shared one-line listing shape for any Source. List rows, search
// results, and timeline entries all render sources the same way:
// a citation line (what/where it is) and an optional title (headline).

import type { Source } from './types';

export function sourceListing(source: Source): { title: string; citation: string } {
  switch (source.type) {
    case 'clipping':
      return {
        title: source.headline,
        citation: `${source.date ?? 'undated'} — ${source.newspaper}, p.${source.page}`,
      };
    case 'document':
      return {
        title: source.headline,
        citation: `${source.date_raw ?? source.date ?? 'undated'} — ${source.collection || humanizeDocumentType(source.document_type)}`,
      };
  }
}

export function humanizeDocumentType(documentType: string): string {
  return documentType.replace(/_/g, ' ');
}
