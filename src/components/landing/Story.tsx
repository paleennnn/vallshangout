'use client';

import { useRef, type ReactNode } from 'react';
import { m, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { formatIDR } from '@/lib/engine/split';
import { SceneDebts, SceneReceipt, SceneShare } from './Scenes';
import { BARS, EQUAL_SHARE, RAW_DEBTS, SETTLED } from './demoData';
import { useElementWidth } from './useElementWidth';

const smallest = BARS.reduce((a, b) => (a.total < b.total ? a : b));

const STEPS = [
  {
    label: 'Struk',
    title: 'Satu struk, dipotong per orang.',
    body: 'Tandai siapa yang makan apa. Kentang goreng yang dimakan bertiga dibagi tanpa sisa satu rupiah pun.',
  },
  {
    label: 'Pajak',
    title: 'Service dan pajak ikut porsi masing-masing.',
    body: `${smallest.person.name} hanya pesan es teh, jadi dia tidak ikut menanggung steak. Garis putus-putus adalah jatahnya kalau dibagi rata (${formatIDR(EQUAL_SHARE)}).`,
  },
  {
    label: 'Transfer',
    title: 'Banyak utang, sedikit transfer.',
    body: `Gantian talangin di tiga tempat? ${RAW_DEBTS.length} utang yang saling silang disederhanakan menjadi ${SETTLED.length} transfer.`,
  },
] as const;

// Jendela scroll tiap adegan (0..1 dari seluruh section)
const WIN = [
  { local: [0, 0.32], fade: [0, 0.3, 0.33] },
  { local: [0.34, 0.64], fade: [0.3, 0.345, 0.375, 0.615, 0.645] },
  { local: [0.66, 0.96], fade: [0.615, 0.66, 0.69, 1] },
] as const;

function Heading({ i, children }: { i: number; children?: ReactNode }) {
  const s = STEPS[i];
  return (
    <div>
      <h2 className="text-[clamp(1.7rem,3.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.025em] text-cream">{s.title}</h2>
      <p className="mt-3 max-w-[46ch] text-base text-night-muted">{s.body}</p>
      {children}
    </div>
  );
}

const STAGE = 'relative mx-auto h-[440px] w-full max-w-[560px]';

// Versi scroll (sticky + progres terhubung ke scroll)
function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>();

  const l0 = useTransform(p, [...WIN[0].local], [0, 1]);
  const l1 = useTransform(p, [...WIN[1].local], [0, 1]);
  const l2 = useTransform(p, [...WIN[2].local], [0, 1]);
  const o0 = useTransform(p, [...WIN[0].fade], [1, 1, 0]);
  const o1 = useTransform(p, [...WIN[1].fade], [0, 0, 1, 1, 0]);
  const o2 = useTransform(p, [...WIN[2].fade], [0, 0, 1, 1]);
  const locals = [l0, l1, l2];
  const opacities = [o0, o1, o2];

  return (
    <section ref={ref} id="cara-kerja" className="on-night relative h-[430svh] bg-night text-cream" aria-labelledby="cara-kerja-sr">
      <h2 id="cara-kerja-sr" className="sr-only">Cara kerja</h2>
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden pt-14 max-md:pb-24">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-6 px-5 lg:grid-cols-[minmax(0,1fr)_560px] lg:gap-16">
          {/* teks adegan (bertumpuk, saling memudar) */}
          <div>
            <div className="relative h-[190px] lg:h-[230px]" aria-hidden="true">
              {STEPS.map((_, i) => (
                <m.div key={i} style={{ opacity: opacities[i] }} className="absolute inset-0">
                  <Heading i={i} />
                </m.div>
              ))}
            </div>
            <ol className="mt-4 hidden max-w-sm grid-cols-3 gap-3 lg:grid" aria-hidden="true">
              {STEPS.map((s, i) => (
                <li key={s.label} className="text-sm font-semibold text-night-muted">
                  <span className="mb-2 block h-[3px] overflow-hidden rounded bg-night-raised">
                    <m.span style={{ scaleX: locals[i] }} className="block h-full origin-left bg-brand" />
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          </div>

          {/* panggung */}
          <div ref={stageRef} className={STAGE} aria-hidden="true">
            <m.div style={{ opacity: o0 }} className="absolute inset-0">
              <SceneReceipt p={l0} stageWidth={stageWidth} />
            </m.div>
            <m.div style={{ opacity: o1 }} className="absolute inset-0">
              <SceneShare p={l1} />
            </m.div>
            <m.div style={{ opacity: o2 }} className="absolute inset-0">
              <SceneDebts p={l2} />
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Versi statis (prefers-reduced-motion): tiga adegan berurutan, keadaan akhir
function StaticScene({ i, render }: { i: number; render: (p: MotionValue<number>, w: number) => ReactNode }) {
  const done = useMotionValue(1);
  const [ref, w] = useElementWidth<HTMLDivElement>();
  return (
    <div className="grid grid-cols-1 items-center gap-8 py-14 lg:grid-cols-[minmax(0,1fr)_560px] lg:gap-16">
      <Heading i={i} />
      <div ref={ref} className={STAGE}>
        {render(done, w)}
      </div>
    </div>
  );
}

function StaticStory() {
  return (
    <section id="cara-kerja" className="on-night bg-night text-cream">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="sr-only">Cara kerja</h2>
        <StaticScene i={0} render={(p, w) => <SceneReceipt p={p} stageWidth={w} />} />
        <StaticScene i={1} render={(p) => <SceneShare p={p} />} />
        <StaticScene i={2} render={(p) => <SceneDebts p={p} />} />
      </div>
    </section>
  );
}

export function Story() {
  const reduce = useReducedMotion();
  return reduce ? <StaticStory /> : <ScrollStory />;
}
