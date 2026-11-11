'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { animate, m, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { pickWeighted } from '@/lib/engine/random';

export const MAX_WHEEL_OPTIONS = 20;
/** Panjang maksimal nama pilihan yang diketik; roda sendiri memotong tampilannya lebih pendek lagi. */
export const MAX_WHEEL_LABEL = 24;

export interface WheelHandle {
  /** Putar dan tentukan pemenang di sisi klien (acak berbobot). */
  spin: () => void;
  /** Putar lalu berhenti di `index` yang sudah ditentukan pihak lain (mis. undian server di room). */
  spinTo: (index: number) => void;
}

interface WheelProps {
  labels: string[];
  /**
   * Bobot tiap pilihan (> 0). Lebar irisan sebanding bobot, jadi irisan besar memang lebih
   * berpeluang menang. Tanpa ini semua irisan sama besar.
   */
  weights?: number[];
  /** Dipanggil saat roda berhenti. `index` mengacu ke `labels` saat roda mulai diputar. */
  onResult?: (index: number) => void;
  onSpinStart?: () => void;
  /** Putar otomatis sekali setelah sekian milidetik (dilewati bila pengguna meminta animasi dikurangi). */
  autoSpinMs?: number;
}

const BASE = [
  { fill: '#F97316', ink: '#292524' },
  { fill: '#FFFFFF', ink: '#292524' },
  { fill: '#292524', ink: '#FFF7ED' },
  { fill: '#FED7AA', ink: '#292524' },
];
const EXTRA = { fill: '#FFEDD5', ink: '#292524' };

/** Warna bergilir; segmen terakhir tidak boleh sama dengan segmen pertama (bersebelahan). */
function colorsFor(n: number) {
  const out = Array.from({ length: n }, (_, i) => BASE[i % BASE.length]);
  if (n > 2 && out[n - 1] === out[0]) out[n - 1] = EXTRA;
  return out;
}

const C = 160;
function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function slice(start: number, end: number) {
  const [x0, y0] = polar(150, start);
  const [x1, y1] = polar(150, end);
  return `M${C},${C} L${x0},${y0} A150,150 0 ${end - start > 180 ? 1 : 0} 1 ${x1},${y1} Z`;
}

/** Batas sudut tiap irisan: [0, a1, a2, ..., 360]. */
export function boundsFor(weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [0];
  weights.forEach((w) => out.push(out[out.length - 1] + (360 * w) / sum));
  out[out.length - 1] = 360;
  return out;
}

/** Indeks irisan yang memuat sudut `angle` (0..360). */
function segmentAt(bounds: number[], angle: number) {
  for (let i = 0; i < bounds.length - 1; i++) if (angle < bounds[i + 1]) return i;
  return bounds.length - 2;
}

/** Rotasi (derajat, searah jarum jam) supaya irisan [start, end] berhenti tepat di bawah penunjuk di atas roda. */
function targetRotation(start: number, end: number, current: number) {
  const jitter = (Math.random() - 0.5) * (end - start) * 0.55;
  const center = (start + end) / 2 + jitter;
  const desired = (((360 - center) % 360) + 360) % 360;
  const base = current - (((current % 360) + 360) % 360);
  let t = base + desired;
  while (t < current + 360 * 4) t += 360;
  return t;
}

function shorten(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export const Wheel = forwardRef<WheelHandle, WheelProps>(function Wheel(
  { labels, weights, onResult, onSpinStart, autoSpinMs },
  ref,
) {
  const reduce = useReducedMotion();
  const rotation = useMotionValue(0);
  const pointer = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  const spinningRef = useRef(false);
  const lastSeg = useRef(0);
  const started = useRef(false);
  const stop = useRef<(() => void) | null>(null);

  const n = labels.length;
  const w =
    weights && weights.length === n && weights.every((x) => x > 0 && Number.isFinite(x))
      ? weights
      : labels.map(() => 1);
  const bounds = boundsFor(w);
  const colors = colorsFor(n);
  const fontSize = n <= 8 ? 14.5 : n <= 12 ? 12.5 : 11;
  const maxChars = n <= 8 ? 11 : n <= 12 ? 10 : 9;

  // Penunjuk bergetar tiap melewati batas irisan
  useMotionValueEvent(rotation, 'change', (v) => {
    const s = segmentAt(bounds, ((-v % 360) + 360) % 360);
    if (s !== lastSeg.current && spinningRef.current && !reduce) {
      lastSeg.current = s;
      animate(pointer, [0, -16, 0], { duration: 0.12 });
    }
  });

  function spin(forced?: number) {
    if (spinningRef.current || n < 2) return;
    if (forced !== undefined && !(Number.isInteger(forced) && forced >= 0 && forced < n)) return;
    const winner = forced ?? pickWeighted(w);
    const target = targetRotation(bounds[winner], bounds[winner + 1], rotation.get());
    onSpinStart?.();
    if (reduce) {
      rotation.set(target);
      onResult?.(winner);
      return;
    }
    spinningRef.current = true;
    setSpinning(true);
    const controls = animate(rotation, target, { duration: 4.4, ease: [0.12, 0.72, 0.18, 1] });
    stop.current = () => controls.stop();
    controls.then(() => {
      spinningRef.current = false;
      setSpinning(false);
      onResult?.(winner);
    });
  }

  useImperativeHandle(ref, () => ({ spin: () => spin(), spinTo: (index: number) => spin(index) }));
  const spinRef = useRef(spin);
  spinRef.current = spin;

  useEffect(() => {
    if (!autoSpinMs || started.current || reduce) return;
    started.current = true;
    const t = setTimeout(() => spinRef.current(), autoSpinMs);
    return () => clearTimeout(t);
  }, [autoSpinMs, reduce]);

  useEffect(() => () => stop.current?.(), []);

  return (
    <div className="relative aspect-square w-full">
      {/* penunjuk */}
      <m.div
        style={{ rotate: pointer, transformOrigin: '50% 0%' }}
        className="absolute left-1/2 top-[-6px] z-20 -ml-[13px]"
        aria-hidden="true"
      >
        <svg width="26" height="34" viewBox="0 0 26 34">
          <path d="M13 34 L1 4 Q13 -3 25 4 Z" fill="#292524" stroke="#FFF7ED" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </m.div>

      {/* Pembungkus melingkar: kotak SVG yang miring tidak boleh memperlebar halaman (overflow horizontal di HP) */}
      <div className="absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
        <m.div style={{ rotate: rotation }} className="absolute inset-0 will-change-transform">
          <svg viewBox="0 0 320 320" className="h-full w-full">
            <circle cx={C} cy={C} r="157" fill="#292524" />
            {labels.map((label, i) => {
              const arc = bounds[i + 1] - bounds[i];
              const mid = bounds[i] + arc / 2;
              return (
                <g key={`${i}-${label}`}>
                  <path d={slice(bounds[i], bounds[i + 1])} fill={colors[i].fill} stroke="#FFF7ED" strokeWidth="2" />
                  {/* irisan terlalu sempit tidak muat teks; namanya tetap muncul di hasil */}
                  {arc >= 13 && (
                    <text
                      transform={`rotate(${mid} ${C} ${C})`}
                      x={C}
                      y={C - 106}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={fontSize}
                      fontWeight="700"
                      fill={colors[i].ink}
                      fontFamily="var(--font-sans)"
                    >
                      {shorten(label, maxChars)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </m.div>
      </div>

      <button
        type="button"
        onClick={() => spin()}
        disabled={spinning || n < 2}
        aria-label="Putar roda"
        className="absolute left-1/2 top-1/2 z-10 grid aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-cream bg-brand text-sm font-extrabold text-ink hover:bg-brand-hover disabled:cursor-default disabled:hover:bg-brand"
      >
        {spinning ? '…' : 'Putar'}
      </button>
    </div>
  );
});
