'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, m, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';

const PLACES = ['Cafe A', 'Billiard', 'Rental PS', 'Karaoke', 'Warung', 'Futsal', 'Cafe B', 'Bowling'];
const FILL = ['#F97316', '#FFFFFF', '#292524', '#FED7AA', '#F97316', '#FFFFFF', '#292524', '#FED7AA'];
const TEXT = ['#292524', '#292524', '#FFF7ED', '#292524', '#292524', '#292524', '#FFF7ED', '#292524'];
const N = PLACES.length;
const SEG = 360 / N;
const C = 160; // pusat viewBox 320

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}
function slice(i: number) {
  const [x0, y0] = polar(150, i * SEG);
  const [x1, y1] = polar(150, (i + 1) * SEG);
  return `M${C},${C} L${x0},${y0} A150,150 0 0 1 ${x1},${y1} Z`;
}

/** Rotasi (derajat, searah jarum jam) agar `index` berhenti tepat di bawah penunjuk (atas). */
function targetRotation(index: number, current: number) {
  const jitter = (Math.random() - 0.5) * SEG * 0.55;
  const center = (index + 0.5) * SEG + jitter;
  const desired = (((360 - center) % 360) + 360) % 360;
  const base = current - (((current % 360) + 360) % 360);
  let t = base + desired;
  while (t < current + 360 * 4) t += 360;
  return t;
}

export function SpinWheel() {
  const reduce = useReducedMotion();
  const rotation = useMotionValue(0);
  const pointer = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const lastSeg = useRef(0);
  const started = useRef(false);

  // Penunjuk bergetar tiap melewati batas segmen
  useMotionValueEvent(rotation, 'change', (v) => {
    const seg = Math.floor((((-v % 360) + 360) % 360) / SEG);
    if (seg !== lastSeg.current && spinning && !reduce) {
      lastSeg.current = seg;
      animate(pointer, [0, -16, 0], { duration: 0.12 });
    }
  });

  function spin() {
    if (spinning) return;
    const winner = Math.floor(Math.random() * N); // demo; di aplikasi asli diundi di server (do_spin)
    const target = targetRotation(winner, rotation.get());
    setResult(null);
    if (reduce) {
      rotation.set(target);
      setResult(winner);
      return;
    }
    setSpinning(true);
    animate(rotation, target, { duration: 4.4, ease: [0.12, 0.72, 0.18, 1] }).then(() => {
      setSpinning(false);
      setResult(winner);
    });
  }

  // Satu-satunya animasi saat halaman dibuka: roda berputar sekali lalu berhenti di satu tempat.
  useEffect(() => {
    if (started.current || reduce) return;
    started.current = true;
    const t = setTimeout(spin, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <div className="mx-auto w-full max-w-[380px]">
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

        <m.div style={{ rotate: rotation }} className="absolute inset-0 will-change-transform" aria-hidden="true">
          <svg viewBox="0 0 320 320" className="h-full w-full">
            <circle cx={C} cy={C} r="157" fill="#292524" />
            {PLACES.map((name, i) => {
              const mid = i * SEG + SEG / 2;
              return (
                <g key={name}>
                  <path d={slice(i)} fill={FILL[i]} stroke="#FFF7ED" strokeWidth="2" />
                  <text
                    transform={`rotate(${mid} ${C} ${C})`}
                    x={C}
                    y={C - 106}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="14.5"
                    fontWeight="700"
                    fill={TEXT[i]}
                    fontFamily="var(--font-sans)"
                  >
                    {name}
                  </text>
                </g>
              );
            })}
          </svg>
        </m.div>

        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="absolute left-1/2 top-1/2 z-10 grid h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-cream bg-brand text-sm font-extrabold text-ink hover:bg-brand-hover disabled:cursor-default disabled:hover:bg-brand"
        >
          {spinning ? '…' : 'Putar'}
        </button>
      </div>

      <p className="mt-6 min-h-14 text-center text-lg" aria-live="polite">
        {result === null ? (
          <span className="text-muted">{spinning ? 'Memilih tempat…' : 'Ketuk Putar untuk memilih tempat.'}</span>
        ) : (
          <>
            <span className="text-muted">Malam ini ke </span>
            <span className="font-extrabold">{PLACES[result]}</span>
            <button type="button" onClick={spin} className="ml-3 text-sm font-semibold text-brand-ink underline underline-offset-4">
              Putar lagi
            </button>
          </>
        )}
      </p>
    </div>
  );
}
