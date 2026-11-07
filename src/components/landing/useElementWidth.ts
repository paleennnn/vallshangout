'use client';

import { useEffect, useRef, useState } from 'react';

/** Lebar elemen (px), diperbarui saat ukuran berubah. Dipakai untuk menghitung jarak terbang potongan struk. */
export function useElementWidth<T extends HTMLElement>(initial = 360) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
