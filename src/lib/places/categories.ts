import {
  Coffee,
  Dices,
  Dumbbell,
  Gamepad2,
  MapPin,
  MicVocal,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

/** Cermin seed `place_categories` di supabase/migrations/0001_init.sql (anak tanpa ikon memakai ikon induk). */
export interface Category {
  slug: string;
  name: string;
  icon: LucideIcon;
  parent?: string;
}

export const PARENT_CATEGORIES: Category[] = [
  { slug: 'cafe', name: 'Cafe', icon: Coffee },
  { slug: 'game', name: 'Game', icon: Gamepad2 },
  { slug: 'resto', name: 'Resto', icon: Utensils },
  { slug: 'sport', name: 'Olahraga', icon: Dumbbell },
  { slug: 'outdoor', name: 'Outdoor', icon: Trees },
];

export const CHILD_CATEGORIES: Category[] = [
  { slug: 'billiard', name: 'Billiard', icon: Gamepad2, parent: 'game' },
  { slug: 'playstation', name: 'PlayStation', icon: Gamepad2, parent: 'game' },
  { slug: 'board-game', name: 'Board Game', icon: Dices, parent: 'game' },
  { slug: 'karaoke', name: 'Karaoke', icon: MicVocal, parent: 'game' },
  { slug: 'bowling', name: 'Bowling', icon: Gamepad2, parent: 'game' },
  { slug: 'futsal', name: 'Futsal', icon: Dumbbell, parent: 'sport' },
  { slug: 'badminton', name: 'Badminton', icon: Dumbbell, parent: 'sport' },
];

export const CATEGORIES: Category[] = [...PARENT_CATEGORIES, ...CHILD_CATEGORIES];

const FALLBACK: Category = { slug: 'lainnya', name: 'Lainnya', icon: MapPin };

export const isCategory = (slug: string) => CATEGORIES.some((c) => c.slug === slug);
export const categoryOf = (slug: string): Category => CATEGORIES.find((c) => c.slug === slug) ?? FALLBACK;
/** Kategori induk (cafe, game, ...) dari slug apa pun; dipakai untuk filter. */
export const rootSlug = (slug: string) => categoryOf(slug).parent ?? slug;
/** Tempat bermain/olahraga biasanya ditagih per jam. */
export const usesHourlyRate = (slug: string) => ['game', 'sport'].includes(rootSlug(slug));
