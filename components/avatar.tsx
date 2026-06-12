// Person avatar: the person's confirmed photo crop when one is
// registered (photos.yaml + R2 bucket), otherwise a warm blank-person
// silhouette — vector iconography, so no binary and no bucket needed.
// James gets his 1919 face crop once the image bucket is configured;
// Patrick (no surviving photo yet) gets the silhouette.

import Image from 'next/image';
import { photoUrl } from '@/lib/data';
import type { Archive, PersonRecord } from '@/lib/data';

export function PersonAvatar({
  person,
  archive,
  size = 40,
  className = '',
}: {
  person: PersonRecord;
  archive: Archive;
  size?: number;
  className?: string;
}) {
  const photos = archive.photosByPersonId.get(person.id) ?? [];
  const photo = photos.find(p => p.kind === 'face_crop' || p.kind === 'portrait') ?? photos[0];
  const url = photo ? photoUrl(photo) : null;

  if (url) {
    return (
      <Image
        src={url}
        alt={person.display_name}
        width={size * 2}
        height={size * 2}
        className={`rounded-full border border-amber-300/60 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <PersonSilhouette size={size} className={className} title={person.display_name} />;
}

export function PersonSilhouette({
  size = 40,
  className = '',
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title ?? 'person'}
      className={`rounded-full ${className}`}
    >
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="24" fill="#f0e7d8" />
      <circle cx="24" cy="18.5" r="8" fill="#b8a888" />
      <path d="M8 44c1.5-9 8-13.5 16-13.5S38.5 35 40 44Z" fill="#b8a888" />
      <circle cx="24" cy="24" r="23.25" fill="none" stroke="#d8c9ae" strokeWidth="1.5" />
    </svg>
  );
}
