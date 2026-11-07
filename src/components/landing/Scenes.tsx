'use client';

import { m, useTransform, type MotionValue } from 'motion/react';
import { formatIDR } from '@/lib/engine/split';
import { Counter } from './Counter';
import {
  BARS,
  EQUAL_SHARE,
  MAX_TOTAL,
  PEOPLE3,
  PEOPLE4,
  RAW_DEBTS,
  RECEIPT_ROWS,
  RESULT1,
  SERVICE_PCT,
  SETTLED,
  TAX_PCT,
  type DemoPerson,
} from './demoData';

/** Semua adegan menerima `p`: progres lokal 0..1 (sudah dipetakan dari scroll). */
type P = { p: MotionValue<number> };

const smooth = (t: number) => t * t * (3 - 2 * t);
const initials = (name: string) => name.slice(0, 1).toUpperCase();

function Avatar({ person, size = 40 }: { person: DemoPerson; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-extrabold"
      style={{ width: size, height: size, background: person.color, color: person.ink, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

// Adegan 1: struk dipotong per orang
const ROW_TOP = 56;
const ROW_H = 38;
const CHIP_TARGET_Y = 330; // tinggi (dalam stage) tempat potongan "masuk" ke avatar

const rowStart = (k: number) => 0.16 + 0.17 * k;
const rowEnd = (k: number) => rowStart(k) + 0.27;

function FlyingChip({
  p,
  k,
  person,
  amount,
  label,
  stageWidth,
}: P & { k: number; person: number; amount: number; label: string; stageWidth: number }) {
  const start = rowStart(k);
  const end = rowEnd(k);
  const col = person - 1; // -1, 0, 1 terhadap tengah
  const x = useTransform(p, [start, end], [0, col * (stageWidth / 3)], { ease: smooth });
  const y = useTransform(p, [start, end], [0, CHIP_TARGET_Y - (ROW_TOP + k * ROW_H) - 14], { ease: smooth });
  const scale = useTransform(p, [start, end], [1, 0.62], { ease: smooth });
  const opacity = useTransform(p, [start - 0.004, start, end - 0.035, end], [0, 1, 1, 0]);
  const who = PEOPLE3[person];
  return (
    <m.div
      style={{ x, y, scale, opacity, background: who.color, color: who.ink }}
      className="absolute inset-x-3 top-[4px] flex h-[30px] items-center justify-between rounded-md px-2 text-[12px] font-medium shadow-[0_2px_0_rgba(41,37,36,0.25)]"
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums">{formatIDR(amount).replace('Rp', '').trim()}</span>
    </m.div>
  );
}

function ReceiptRow({ p, k, stageWidth }: P & { k: number; stageWidth: number }) {
  const row = RECEIPT_ROWS[k];
  const start = rowStart(k);
  const fullOpacity = useTransform(p, [start - 0.02, start], [1, 0]);
  return (
    <div className="absolute inset-x-0" style={{ top: ROW_TOP + k * ROW_H, height: ROW_H }}>
      <m.div
        style={{ opacity: fullOpacity }}
        className="absolute inset-x-3 inset-y-0 flex items-center justify-between border-b border-dashed border-ink/20 text-[12px]"
      >
        <span>{row.name}</span>
        <span className="tabular-nums">{formatIDR(row.total).replace('Rp', '').trim()}</span>
      </m.div>
      {row.parts.map((part) => (
        <FlyingChip
          key={part.person}
          p={p}
          k={k}
          person={part.person}
          amount={part.amount}
          label={row.shared ? `${row.name.split(' ')[0]} ÷${row.parts.length}` : row.name}
          stageWidth={stageWidth}
        />
      ))}
    </div>
  );
}

function AvatarTotal({ p, index }: P & { index: number }) {
  const person = PEOPLE3[index];
  const events = RECEIPT_ROWS.flatMap((row, k) =>
    row.parts.filter((x) => x.person === index).map((x) => ({ end: rowEnd(k), amount: x.amount })),
  ).sort((a, b) => a.end - b.end);

  let acc = 0;
  const inputs = [0, ...events.map((e) => e.end), 1];
  const outputs = [0, ...events.map((e) => (acc += e.amount)), acc];
  const value = useTransform(p, inputs, outputs);

  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar person={person} size={44} />
      <span className="text-sm font-semibold text-cream">{person.name}</span>
      <Counter value={value} className="text-sm tabular-nums text-night-muted" />
    </div>
  );
}

export function SceneReceipt({ p, stageWidth }: P & { stageWidth: number }) {
  const drop = useTransform(p, [0, 0.1], [-26, 0]);
  const dropOpacity = useTransform(p, [0, 0.08], [0, 1]);
  return (
    <div className="relative h-full w-full">
      <m.div
        style={{ y: drop, opacity: dropOpacity }}
        className="absolute left-1/2 top-0 -ml-[130px] h-[318px] w-[260px] bg-paper font-mono text-ink"
      >
        <div className="px-3 pt-3 text-center text-[12px]">
          <div className="text-[14px] font-medium">Cafe A</div>
          <div className="text-ink/60">Meja 7, 3 orang</div>
          <div className="mt-2 border-b border-dashed border-ink/25" />
        </div>

        {RECEIPT_ROWS.map((_, k) => (
          <ReceiptRow key={k} p={p} k={k} stageWidth={stageWidth} />
        ))}

        <div className="absolute inset-x-3 text-[12px]" style={{ top: ROW_TOP + RECEIPT_ROWS.length * ROW_H + 6 }}>
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{RESULT1.subtotal.toLocaleString('id-ID')}</span></div>
          <div className="flex justify-between"><span>Service {SERVICE_PCT}%</span><span className="tabular-nums">{serviceOf().toLocaleString('id-ID')}</span></div>
          <div className="flex justify-between"><span>Pajak {TAX_PCT}%</span><span className="tabular-nums">{taxOf().toLocaleString('id-ID')}</span></div>
          <div className="mt-1 flex justify-between border-t border-dashed border-ink/25 pt-1 font-medium"><span>Total</span><span className="tabular-nums">{RESULT1.grandTotal.toLocaleString('id-ID')}</span></div>
        </div>

        {/* tepi struk bergerigi */}
        <div
          className="absolute inset-x-0 -bottom-[8px] h-[8px]"
          style={{
            background:
              'linear-gradient(-45deg, transparent 8px, #fffdf9 0), linear-gradient(45deg, transparent 8px, #fffdf9 0)',
            backgroundSize: '16px 16px',
            backgroundRepeat: 'repeat-x',
          }}
        />
      </m.div>

      <div className="absolute inset-x-0 bottom-0 grid grid-cols-3">
        {PEOPLE3.map((_, i) => (
          <AvatarTotal key={i} p={p} index={i} />
        ))}
      </div>
    </div>
  );
}

function taxOf() {
  return RESULT1.shares.reduce((a, s) => a + s.taxAmount, 0);
}
function serviceOf() {
  return RESULT1.shares.reduce((a, s) => a + s.serviceAmount, 0);
}

// Adegan 2: pajak dibagi sesuai porsi
function BarRow({ p, index }: P & { index: number }) {
  const bar = BARS[index];
  const subPct = (bar.subtotal / MAX_TOTAL) * 100;
  const chargePct = (bar.charges / MAX_TOTAL) * 100;
  const subScale = useTransform(p, [0.04 + index * 0.05, 0.42 + index * 0.05], [0, 1], { ease: smooth });
  const chargeScale = useTransform(p, [0.4 + index * 0.05, 0.78 + index * 0.05], [0, 1], { ease: smooth });
  const total = useTransform(p, [0.04 + index * 0.05, 0.78 + index * 0.05], [0, bar.total]);
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_100px] items-center gap-3">
      <div className="flex items-center gap-2">
        <Avatar person={bar.person} size={26} />
        <span className="text-sm font-semibold text-cream">{bar.person.name}</span>
      </div>
      <div className="relative h-9 overflow-hidden rounded-md bg-night-raised">
        <m.div style={{ scaleX: subScale, width: `${subPct}%` }} className="absolute inset-y-0 left-0 origin-left bg-cream" />
        <m.div
          style={{ scaleX: chargeScale, left: `${subPct}%`, width: `${chargePct}%` }}
          className="absolute inset-y-0 origin-left bg-brand"
        />
      </div>
      <Counter value={total} className="text-right text-sm font-semibold tabular-nums text-cream" />
    </div>
  );
}

export function SceneShare({ p }: P) {
  const markerOpacity = useTransform(p, [0.8, 0.95], [0, 1]);
  const saved = EQUAL_SHARE - Math.min(...BARS.map((b) => b.total));
  const smallest = BARS.reduce((a, b) => (a.total < b.total ? a : b));
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-night-muted">
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-sm bg-cream" />pesanan sendiri</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-sm bg-brand" />bagian service + pajak</span>
      </div>

      <div className="relative">
        <div className="space-y-4">
          {BARS.map((_, i) => (
            <BarRow key={i} p={p} index={i} />
          ))}
        </div>
        {/* garis jatah kalau dibagi rata (kolom tengah: 96px nama + 12 jarak, 100px total + 12 jarak) */}
        <m.div
          style={{ opacity: markerOpacity }}
          className="pointer-events-none absolute -top-5 bottom-0 left-[108px] right-[112px]"
          aria-hidden="true"
        >
          <div className="absolute bottom-0 top-3 border-l-2 border-dashed border-cream/80" style={{ left: `${(EQUAL_SHARE / MAX_TOTAL) * 100}%` }} />
          <span
            className="absolute top-[-6px] -translate-x-1/2 whitespace-nowrap rounded bg-cream px-1.5 py-0.5 text-[11px] font-semibold text-ink"
            style={{ left: `${(EQUAL_SHARE / MAX_TOTAL) * 100}%` }}
          >
            dibagi rata
          </span>
        </m.div>
      </div>

      <m.p style={{ opacity: markerOpacity }} className="text-sm text-night-muted">
        Kalau dibagi rata, {smallest.person.name} bayar {formatIDR(EQUAL_SHARE)}. Dengan pembagian ini
        cukup {formatIDR(smallest.total)}: selisih {formatIDR(saved)} yang tidak perlu dia tanggung.
      </m.p>
    </div>
  );
}

// Adegan 3: banyak utang jadi sedikit transfer
const NODE_R = 24;
const byId = Object.fromEntries(PEOPLE4.map((x) => [x.id, x]));

function geometry(from: string, to: string, bend: number) {
  const a = byId[from];
  const b = byId[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const sx = a.x + ux * (NODE_R + 3);
  const sy = a.y + uy * (NODE_R + 3);
  const ex = b.x - ux * (NODE_R + 11);
  const ey = b.y - uy * (NODE_R + 11);
  const cx = (sx + ex) / 2 + nx * bend;
  const cy = (sy + ey) / 2 + ny * bend;
  // ujung panah mengikuti arah garis di titik akhir
  const tx = ex - cx;
  const ty = ey - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const hx = tx / tl;
  const hy = ty / tl;
  const tip = `${ex + hx * 9},${ey + hy * 9}`;
  const l = `${ex - hx * 2 - hy * 6},${ey - hy * 2 + hx * 6}`;
  const r = `${ex - hx * 2 + hy * 6},${ey - hy * 2 - hx * 6}`;
  return {
    d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`,
    head: `${l} ${tip} ${r}`,
    mid: { x: 0.25 * sx + 0.5 * cx + 0.25 * ex, y: 0.25 * sy + 0.5 * cy + 0.25 * ey },
  };
}

function RawArrow({ p, debt, index }: P & { debt: (typeof RAW_DEBTS)[number]; index: number }) {
  const g = geometry(debt.from, debt.to, 16 + debt.bill * 9);
  const a = 0.02 + index * 0.028;
  const draw = useTransform(p, [a, a + 0.14], [0, 1]);
  const fade = useTransform(p, [0.5, 0.62], [1, 0]);
  const headOpacity = useTransform(p, [a + 0.11, a + 0.14], [0, 1]);
  return (
    <m.g style={{ opacity: fade }}>
      <m.path d={g.d} fill="none" stroke="#a8a29e" strokeWidth="1.6" strokeLinecap="round" style={{ pathLength: draw }} />
      <m.polygon points={g.head} fill="#a8a29e" style={{ opacity: headOpacity }} />
    </m.g>
  );
}

function SettledArrow({ p, t, index }: P & { t: (typeof SETTLED)[number]; index: number }) {
  const g = geometry(t.from, t.to, 0);
  const a = 0.62 + index * 0.1;
  const draw = useTransform(p, [a, a + 0.16], [0, 1]);
  const headOpacity = useTransform(p, [a + 0.13, a + 0.16], [0, 1]);
  const label = useTransform(p, [a + 0.12, a + 0.2], [0, 1]);
  return (
    <g>
      <m.path d={g.d} fill="none" stroke="#f97316" strokeWidth="3.4" strokeLinecap="round" style={{ pathLength: draw }} />
      <m.polygon points={g.head} fill="#f97316" style={{ opacity: headOpacity }} />
      <m.text
        x={g.mid.x}
        y={g.mid.y - 7}
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="700"
        fill="#fff7ed"
        stroke="#292524"
        strokeWidth="4"
        paintOrder="stroke"
        style={{ opacity: label }}
      >
        {formatIDR(t.amount)}
      </m.text>
    </g>
  );
}

export function SceneDebts({ p }: P) {
  const rawOpacity = useTransform(p, [0.5, 0.62], [1, 0]);
  const settledOpacity = useTransform(p, [0.62, 0.74], [0, 1]);
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <svg viewBox="0 0 420 300" className="mx-auto w-full max-w-[440px]" role="img" aria-label={`${RAW_DEBTS.length} utang disederhanakan menjadi ${SETTLED.length} transfer`}>
        {RAW_DEBTS.map((d, i) => (
          <RawArrow key={i} p={p} debt={d} index={i} />
        ))}
        {SETTLED.map((t, i) => (
          <SettledArrow key={i} p={p} t={t} index={i} />
        ))}
        {PEOPLE4.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={NODE_R} fill={n.color} stroke="#292524" strokeWidth="3" />
            <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="800" fill={n.ink}>
              {initials(n.name)}
            </text>
            <text x={n.x} y={n.y + (n.y > 150 ? NODE_R + 17 : n.y < 150 ? -NODE_R - 8 : NODE_R + 17)} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#fff7ed">
              {n.name}
            </text>
          </g>
        ))}
      </svg>

      <div className="relative h-14 text-center">
        <m.p style={{ opacity: rawOpacity }} className="absolute inset-x-0 text-lg font-semibold text-cream">
          {RAW_DEBTS.length} utang saling silang
        </m.p>
        <m.p style={{ opacity: settledOpacity }} className="absolute inset-x-0 text-lg font-semibold text-cream">
          Cukup {SETTLED.length} transfer
        </m.p>
      </div>
    </div>
  );
}
