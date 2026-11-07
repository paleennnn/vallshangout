'use client';

import { useEffect, useRef } from 'react';
import { useMotionValueEvent, type MotionValue } from 'motion/react';
import { formatIDR } from '@/lib/engine/split';

/** Angka rupiah yang mengikuti MotionValue tanpa re-render React per frame. */
export function Counter({ value, className }: { value: MotionValue<number>; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const write = (v: number) => {
    if (ref.current) ref.current.textContent = formatIDR(Math.max(0, Math.round(v)));
  };
  useMotionValueEvent(value, 'change', write);
  useEffect(() => write(value.get()), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className={className}>
      {formatIDR(0)}
    </span>
  );
}
