'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, RotateCw, X } from 'lucide-react';
import { MAX_WHEEL_OPTIONS, Wheel, type WheelHandle } from '@/components/wheel/Wheel';

export const SPIN_STORAGE_KEY = 'vh:spin:v1';
const SAMPLE = ['Cafe A', 'Billiard', 'Rental PS', 'Karaoke', 'Warung', 'Futsal'];
const MAX_HISTORY = 8;
const MAX_LABEL = 24;

interface HistoryItem {
  label: string;
  at: number;
}
interface Saved {
  options: string[];
  history: HistoryItem[];
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(SPIN_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Saved>;
    if (!Array.isArray(s.options) || !s.options.every((o) => typeof o === 'string')) return null;
    const history = Array.isArray(s.history)
      ? s.history.filter((h): h is HistoryItem => typeof h?.label === 'string' && typeof h?.at === 'number')
      : [];
    return { options: s.options.slice(0, MAX_WHEEL_OPTIONS), history: history.slice(0, MAX_HISTORY) };
  } catch {
    return null;
  }
}

const time = (at: number) =>
  new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Roda putar mandiri: pilihan kustom, riwayat, dan "coret" untuk menyisihkan pilihan. Tersimpan di perangkat. */
export function SpinTool() {
  const wheel = useRef<WheelHandle>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = load();
    if (saved) {
      setOptions(saved.options);
      setHistory(saved.history);
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SPIN_STORAGE_KEY, JSON.stringify({ options, history } satisfies Saved));
    } catch {
      /* penyimpanan penuh atau mode privat */
    }
  }, [options, history, hydrated]);

  function changeOptions(next: string[]) {
    setOptions(next);
    setResult(null); // indeks hasil lama tidak berlaku lagi
  }

  function addOption() {
    const label = draft.trim().slice(0, MAX_LABEL);
    if (!label) return;
    if (options.length >= MAX_WHEEL_OPTIONS) return setNotice(`Maksimal ${MAX_WHEEL_OPTIONS} pilihan.`);
    if (options.some((o) => o.toLowerCase() === label.toLowerCase())) return setNotice(`"${label}" sudah ada di roda.`);
    setNotice(null);
    setDraft('');
    changeOptions([...options, label]);
  }

  const removeAt = (i: number) => changeOptions(options.filter((_, idx) => idx !== i));
  const canSpin = options.length >= 2;

  const card = 'space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5';

  return (
    <div className="space-y-5">
      {canSpin ? (
        <section className={card}>
          <div className="mx-auto w-full max-w-[340px] pt-3">
            <Wheel
              ref={wheel}
              labels={options}
              onSpinStart={() => {
                setSpinning(true);
                setResult(null);
              }}
              onResult={(i) => {
                setSpinning(false);
                setResult(i);
                setHistory((h) => [{ label: options[i], at: Date.now() }, ...h].slice(0, MAX_HISTORY));
              }}
            />
          </div>

          <div className="min-h-[7.5rem] text-center" aria-live="polite">
            {spinning && <p className="pt-4 text-lg text-muted">Memilih…</p>}
            {!spinning && result === null && <p className="pt-4 text-muted">Ketuk Putar di tengah roda.</p>}
            {!spinning && result !== null && (
              <div className="space-y-3">
                <p className="text-sm text-muted">Hasilnya</p>
                <p className="text-3xl font-extrabold leading-tight tracking-tight">{options[result]}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => wheel.current?.spin()}
                    className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 text-sm font-bold text-ink hover:bg-brand-hover"
                  >
                    <RotateCw size={16} aria-hidden="true" />
                    Putar lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(result)}
                    className="inline-flex h-11 items-center gap-2 rounded-control bg-sand px-4 text-sm font-semibold hover:bg-sand-strong"
                  >
                    <X size={16} aria-hidden="true" />
                    Coret dari roda
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className={card}>
          <h2 className="font-semibold">Tambahkan pilihan dulu</h2>
          <p className="text-sm text-muted">Roda butuh minimal 2 pilihan, misalnya nama tempat yang ingin kalian datangi.</p>
        </section>
      )}

      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Pilihan di roda</h2>
          <span className="text-sm text-muted">
            {options.length}/{MAX_WHEEL_OPTIONS}
          </span>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addOption();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LABEL}
            disabled={spinning}
            placeholder="Nama tempat atau pilihan"
            aria-label="Pilihan baru"
            enterKeyHint="done"
            className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 focus:border-brand disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={spinning || !draft.trim()}
            className="inline-flex h-11 items-center gap-1.5 rounded-control bg-brand px-4 font-semibold text-ink hover:bg-brand-hover disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            Tambah
          </button>
        </form>
        {notice && <p className="text-sm text-warning">{notice}</p>}

        {options.length === 0 ? (
          <button
            type="button"
            onClick={() => changeOptions(SAMPLE)}
            className="text-sm font-semibold text-brand-ink underline underline-offset-4"
          >
            Coba dengan contoh
          </button>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {options.map((label, i) => (
              <li key={label} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-sm text-brand-ink">
                {label}
                <button
                  type="button"
                  disabled={spinning}
                  onClick={() => removeAt(i)}
                  aria-label={`Hapus ${label}`}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-sand disabled:opacity-50"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">Hasil sebelumnya</h2>
          <ol className="divide-y divide-line">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className={i === 0 ? 'font-semibold' : ''}>{h.label}</span>
                <span className="tabular-nums text-muted">{time(h.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
