'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PLACES_KEY,
  createPlace,
  loadPlaces,
  parsePlaces,
  recordVisit,
  savePlaces,
  updatePlace,
  type Place,
  type PlaceInput,
} from '@/lib/places/store';

/** Daftar tempat di localStorage, sinkron antar tab. */
export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlaces(loadPlaces());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PLACES_KEY) setPlaces(parsePlaces(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (ready) savePlaces(places);
  }, [places, ready]);

  const add = useCallback((input: PlaceInput) => setPlaces((p) => [...p, createPlace(input)]), []);
  const addMany = useCallback((inputs: PlaceInput[]) => setPlaces((p) => [...p, ...inputs.map((i) => createPlace(i))]), []);
  const update = useCallback(
    (id: string, input: PlaceInput) => setPlaces((p) => p.map((x) => (x.id === id ? updatePlace(x, input) : x))),
    [],
  );
  const remove = useCallback((id: string) => setPlaces((p) => p.filter((x) => x.id !== id)), []);
  const visit = useCallback((id: string) => setPlaces((p) => p.map((x) => (x.id === id ? recordVisit(x) : x))), []);

  return { places, ready, add, addMany, update, remove, visit };
}
