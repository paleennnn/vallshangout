'use client';

import { useEffect, useState } from 'react';
import { Camera, Check, Copy, ImageUp, TriangleAlert } from 'lucide-react';
import { formatIDR } from '@/lib/engine/split';
import { ENGINES, runEngine } from '@/lib/ocr/engines';
import { analyzeWords, type Analysis, type EngineId, type EngineOutput } from '@/lib/ocr/pipeline';
import { DEFAULT_PREP, prepareCanvas, type PrepOptions } from '@/lib/ocr/preprocess';

interface Run {
  engine: EngineId;
  label: string;
  error?: string;
  output?: EngineOutput;
  analysis?: Analysis;
}

const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold';
const primary = `${btn} bg-brand font-bold text-ink hover:bg-brand-hover disabled:opacity-60`;
const secondary = `${btn} bg-sand hover:bg-sand-strong disabled:opacity-60`;
const box = 'space-y-3 rounded-card border border-line bg-surface p-4';
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} dtk` : `${Math.round(n)} ms`);
const rp = (n: number) => formatIDR(n).replace(/\u00a0/g, ' ');

function RunCard({ run }: { run: Run }) {
  if (run.error || !run.output || !run.analysis) {
    return (
      <section className={box}>
        <h2 className="font-semibold">{run.label}</h2>
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-words">Gagal: {run.error}</span>
        </p>
      </section>
    );
  }
  const { output, analysis } = run;
  const p = analysis.parsed;
  return (
    <section className={box}>
      <div>
        <h2 className="font-semibold">{run.label}</h2>
        <p className="text-sm text-muted">
          Muat model {output.loadMs ? ms(output.loadMs) : '(sudah termuat)'}, baca foto {ms(output.recognizeMs)}, {output.words.length} kata, {analysis.rows.length} baris.
        </p>
      </div>

      <div
        className={`rounded-xl px-3 py-2 text-sm font-medium ${p.reconciled === true ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}
        role="status"
      >
        {p.reconciled === true && `Cocok: hitungan ${rp(p.expectedTotal)} sama dengan total di struk.`}
        {p.reconciled === false && `Tidak cocok: hitungan ${rp(p.expectedTotal)}, total di struk ${rp(p.total ?? 0)}.`}
        {p.reconciled === null && `Total di struk tidak ditemukan. Hitungan dari menu: ${rp(p.expectedTotal)}.`}
      </div>

      <details open>
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Hasil terbaca ({p.items.length} menu)</summary>
        <ul className="space-y-2">
          {p.items.map((it, i) => (
            <li key={`${it.row}-${i}`} className={`rounded-xl border p-3 ${it.suspect ? 'border-warning bg-warning-bg' : 'border-line bg-cream'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{it.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{rp(it.lineTotal)}</span>
              </div>
              <p className="text-sm tabular-nums text-muted">
                {it.qty} × {rp(it.unitPrice)}
              </p>
              {it.suspect && <p className="mt-1 text-sm text-warning">Cek: {it.note ?? 'angkanya tidak konsisten'}.</p>}
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-muted">Jumlah menu</dt><dd>{rp(p.itemsSum)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Subtotal di struk</dt><dd>{p.subtotal === null ? '-' : rp(p.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>{rp(p.serviceAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Pajak{p.taxIncluded ? ' (sudah termasuk)' : ''}</dt><dd>{rp(p.taxAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Diskon</dt><dd>{rp(p.discountAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Pembulatan</dt><dd>{p.roundingAmount < 0 ? `- ${rp(-p.roundingAmount)}` : rp(p.roundingAmount)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total di struk</dt><dd>{p.total === null ? '-' : rp(p.total)}</dd></div>
        </dl>
      </details>

      {(p.warnings.length > 0 || p.suggestions.length > 0) && (
        <details open>
          <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Peringatan ({p.warnings.length})</summary>
          <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
            {p.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {p.suggestions.map((s) => (
            <p key={`${s.item}-${s.to}`} className="mt-2 text-sm">
              Mungkin salah baca satu digit: <strong>{p.items[s.item]?.name}</strong> {rp(s.from)}, seharusnya {rp(s.to)}?
            </p>
          ))}
        </details>
      )}

      <details>
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Baris terbaca ({analysis.rows.length})</summary>
        <ol className="space-y-1 text-sm">
          {analysis.rows.map((r, i) => (
            <li key={i} className="break-words font-mono text-xs">
              <span className="mr-2 text-muted">{i + 1}.</span>
              {r.text}
              {r.minConf !== undefined && r.minConf < 60 && <span className="ml-2 text-warning">(yakin {r.minConf}%)</span>}
            </li>
          ))}
        </ol>
      </details>

      <details>
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Teks mentah dari mesin</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-cream p-3 font-mono text-xs">{output.text}</pre>
      </details>

      {p.ignored.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Baris yang diabaikan ({p.ignored.length})</summary>
          <ul className="space-y-1 font-mono text-xs">
            {p.ignored.map((t, i) => <li key={i} className="break-words">{t}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Halaman uji OCR struk (sementara). Foto diproses sepenuhnya di perangkat dan tidak diunggah.
 * Tujuannya menilai apakah OCR gratis di browser cukup layak untuk dijadikan fitur.
 */
export function OcrLab() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<EngineId, boolean>>({ tesseract: true, paddle: false });
  const [prep, setPrep] = useState<PrepOptions>(DEFAULT_PREP);
  const [status, setStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const chosen = ENGINES.filter((e) => selected[e.id]);

  async function start() {
    if (!file || chosen.length === 0) return;
    setRuns([]);
    setCopied(false);
    try {
      setStatus('Menyiapkan foto...');
      const canvas = await prepareCanvas(file, prep);
      canvas.toBlob((blob) => blob && setPreviewUrl(URL.createObjectURL(blob)), 'image/jpeg', 0.8);
      for (const e of chosen) {
        setStatus(`Menjalankan ${e.label}... (pertama kali bisa lama karena model diunduh)`);
        try {
          const output = await runEngine(e.id, canvas);
          setRuns((r) => [...r, { engine: e.id, label: e.label, output, analysis: analyzeWords(output.words) }]);
        } catch (err) {
          setRuns((r) => [...r, { engine: e.id, label: e.label, error: err instanceof Error ? err.message : String(err) }]);
        }
      }
    } catch (err) {
      setRuns([{ engine: 'tesseract', label: 'Menyiapkan foto', error: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setStatus(null);
    }
  }

  async function copyReport() {
    const report = {
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      prep,
      runs: runs.map((r) => ({
        engine: r.engine,
        error: r.error,
        loadMs: r.output && Math.round(r.output.loadMs),
        recognizeMs: r.output && Math.round(r.output.recognizeMs),
        rawText: r.output?.text,
        rows: r.analysis?.rows.map((x) => x.text),
        parsed: r.analysis?.parsed,
      })),
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Salin laporan ini:', text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pb-32 pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Uji OCR struk</h1>
        <p className="text-sm text-muted">
          Halaman percobaan. Foto diproses di HP kamu dan tidak pernah diunggah. Coba beberapa struk asli, lalu salin laporannya.
        </p>
      </header>

      <section className={box}>
        <div className="grid grid-cols-2 gap-2">
          <label className={`${primary} cursor-pointer`}>
            <Camera size={18} aria-hidden="true" />
            Foto struk
            <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Foto struk dengan kamera" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRuns([]); }} />
          </label>
          <label className={`${secondary} cursor-pointer`}>
            <ImageUp size={18} aria-hidden="true" />
            Dari galeri
            <input type="file" accept="image/*" className="sr-only" aria-label="Pilih foto dari galeri" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRuns([]); }} />
          </label>
        </div>
        {file && <p className="break-words text-sm text-muted">Dipilih: {file.name}</p>}
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Foto struk setelah diolah" className="max-h-80 w-full rounded-xl border border-line object-contain" />
        )}
      </section>

      <section className={box}>
        <fieldset className="space-y-2">
          <legend className="font-medium">Mesin OCR</legend>
          {ENGINES.map((e) => (
            <label key={e.id} className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={selected[e.id]} onChange={(ev) => setSelected((s) => ({ ...s, [e.id]: ev.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
              <span>
                <span className="font-medium">{e.label}</span>
                <span className="block text-muted">{e.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={prep.enhance} onChange={(e) => setPrep((p) => ({ ...p, enhance: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
          <span>
            <span className="font-medium">Perjelas kontras (abu-abu)</span>
            <span className="block text-muted">Membantu struk pudar atau foto remang. Coba matikan bila hasilnya malah buruk.</span>
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Ukuran foto (sisi terpanjang)</span>
          <select value={prep.maxEdge} onChange={(e) => setPrep((p) => ({ ...p, maxEdge: Number(e.target.value) }))} className="h-11 w-full rounded-control border border-line bg-surface px-3">
            <option value={1200}>1200 px (cepat)</option>
            <option value={1600}>1600 px (disarankan)</option>
            <option value={2000}>2000 px (lambat, mungkin lebih jelas)</option>
          </select>
        </label>
        <button type="button" className={`${primary} w-full`} disabled={!file || chosen.length === 0 || status !== null} onClick={start}>
          Jalankan OCR
        </button>
        <p aria-live="polite" className="text-sm text-muted">{status}</p>
      </section>

      {runs.map((r) => <RunCard key={r.engine + r.label} run={r} />)}

      {runs.length > 0 && status === null && (
        <button type="button" className={`${secondary} w-full`} onClick={copyReport}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copied ? 'Tersalin' : 'Salin laporan (JSON)'}
        </button>
      )}
    </main>
  );
}
