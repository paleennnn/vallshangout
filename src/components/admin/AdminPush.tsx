'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Send } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { field, fieldLabel, primary, secondary } from '@/components/room/ui';
import { BODY_MAX, DEFAULT_INACTIVE_DAYS, TITLE_MAX } from '@/lib/admin/validate';

interface Campaign {
  id: string;
  created_at: string;
  title: string;
  body: string;
  url: string;
  audience: 'all' | 'inactive';
  inactive_days: number | null;
  recipients: number;
  sent: number;
  failed: number;
  removed: number;
  status: 'sending' | 'done';
}
interface Counts {
  devices: number;
  users: number;
}
type Audience = 'all' | 'inactive';

const box = 'space-y-3 rounded-card border border-line bg-surface p-4';
const when = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const audienceLabel = (a: Audience, days: number | null) => (a === 'all' ? 'Semua pelanggan' : `Tidak aktif ${days} hari`);

/** Pratinjau kasar tampilan notifikasi di perangkat. */
function Preview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream p-3" aria-label="Pratinjau notifikasi">
      <p className="text-xs text-muted">VallsHangout</p>
      <p className="break-words font-semibold">{title || 'Judul notifikasi'}</p>
      <p className="break-words text-sm">{body || 'Isi pesan akan tampil di sini.'}</p>
    </div>
  );
}

/** Perangkat ini sudah berlangganan push? Dipakai untuk pesan uji. */
async function thisDeviceEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  return sub?.endpoint ?? null;
}

export function AdminPush() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [audience, setAudience] = useState<Audience>('all');
  const [days, setDays] = useState(String(DEFAULT_INACTIVE_DAYS));
  const [counts, setCounts] = useState<Counts | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'send'>(null);
  const [progress, setProgress] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const running = useRef(false);
  // Router disimpan di ref supaya `call` (dan efek yang memakainya) stabil walau identitas router berubah
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  /** Panggil API admin; sesi yang berakhir langsung mengembalikan ke layar masuk. */
  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> => {
      const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (res.status === 401) routerRef.current.refresh();
      return { ok: res.ok, status: res.status, data };
    },
    [],
  );

  const loadCampaigns = useCallback(async () => {
    const r = await call<{ campaigns: Campaign[] }>('/api/admin/push/campaigns');
    if (r.ok) setCampaigns(r.data.campaigns);
  }, [call]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 365;
  const audienceReady = audience === 'all' || daysValid;

  // Jumlah penerima, diperbarui saat audiens berubah (ditunda sebentar agar tidak menembak tiap ketikan)
  useEffect(() => {
    if (!audienceReady) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const q = audience === 'all' ? 'audience=all' : `audience=inactive&days=${daysNumber}`;
      const r = await call<Counts>(`/api/admin/push/audience?${q}`);
      if (!cancelled) setCounts(r.ok ? { devices: r.data.devices, users: r.data.users } : null);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audience, daysNumber, audienceReady, call]);

  const messageReady = title.trim().length > 0 && body.trim().length > 0;

  async function sendTest() {
    setNotice(null);
    setBusy('test');
    try {
      const endpoint = await thisDeviceEndpoint();
      if (!endpoint) {
        setNotice({ kind: 'error', text: 'Perangkat ini belum berlangganan. Buka aplikasi di perangkat ini dan aktifkan notifikasi dulu.' });
        return;
      }
      const r = await call('/api/admin/push/test', { method: 'POST', body: JSON.stringify({ endpoint, title, body, url }) });
      setNotice(r.ok ? { kind: 'ok', text: 'Pesan uji terkirim. Cek notifikasi di perangkat ini.' } : { kind: 'error', text: r.data.error ?? 'Gagal mengirim pesan uji.' });
    } finally {
      setBusy(null);
    }
  }

  /** Mengirim batch demi batch sampai selesai; bisa dilanjutkan bila terputus. */
  async function run(campaign: Campaign) {
    if (running.current) return;
    running.current = true;
    setBusy('send');
    setProgress(campaign);
    let current = campaign;
    try {
      while (current.status !== 'done') {
        const r = await call<{ campaign: Campaign }>(`/api/admin/push/campaigns/${current.id}/batch`, { method: 'POST', body: '{}' });
        if (!r.ok) {
          setNotice({ kind: 'error', text: `${r.data.error ?? 'Pengiriman terhenti.'} Lanjutkan dari riwayat di bawah.` });
          return;
        }
        current = r.data.campaign;
        setProgress(current);
      }
      setNotice({ kind: 'ok', text: `Selesai: ${current.sent} terkirim, ${current.failed} gagal, ${current.removed} langganan tidak berlaku dibersihkan.` });
    } finally {
      running.current = false;
      setBusy(null);
      await loadCampaigns();
    }
  }

  async function startBroadcast() {
    setConfirmOpen(false);
    setNotice(null);
    setBusy('send');
    const r = await call<{ campaign: Campaign }>('/api/admin/push/campaigns', {
      method: 'POST',
      body: JSON.stringify({ title, body, url, audience, days: audience === 'inactive' ? daysNumber : undefined }),
    });
    if (!r.ok) {
      setBusy(null);
      setNotice({ kind: 'error', text: r.data.error ?? 'Gagal membuat siaran.' });
      void loadCampaigns();
      return;
    }
    setBusy(null);
    await run(r.data.campaign);
  }

  async function logout() {
    await call('/api/admin/logout', { method: 'POST', body: '{}' });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pb-32 pt-8">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Siaran notifikasi</h1>
          <p className="text-sm text-muted">Kirim pengumuman ke pengguna yang menyalakan notifikasi dan tidak mematikan pengumuman.</p>
        </div>
        <button type="button" className={secondary} onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
          Keluar
        </button>
      </header>

      <section className={box}>
        <label className="block space-y-1">
          <span className={fieldLabel}>Judul ({title.length}/{TITLE_MAX})</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} className={field} placeholder="Yuk nongkrong lagi" />
        </label>
        <label className="block space-y-1">
          <span className={fieldLabel}>Isi pesan ({body.length}/{BODY_MAX})</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={3}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 focus:border-brand"
            placeholder="Guyss, kalian udah lama ga nongkrong lohh, yuk cuss pakai VallsHangout"
          />
        </label>
        <label className="block space-y-1">
          <span className={fieldLabel}>Tujuan saat notifikasi diketuk</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="/" />
          <span className="text-xs text-muted">Jalur di aplikasi ini saja, misalnya / atau /new.</span>
        </label>
        <Preview title={title} body={body} />
      </section>

      <section className={box}>
        <fieldset className="space-y-2">
          <legend className="font-medium">Penerima</legend>
          <label className="flex items-center gap-3 text-sm">
            <input type="radio" name="audience" checked={audience === 'all'} onChange={() => setAudience('all')} className="h-5 w-5 accent-brand" />
            Semua pelanggan
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="radio" name="audience" checked={audience === 'inactive'} onChange={() => setAudience('inactive')} className="h-5 w-5 accent-brand" />
            Yang tidak aktif lebih dari
            <input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
              disabled={audience !== 'inactive'}
              aria-label="Hari tidak aktif"
              className="h-11 w-16 rounded-control border border-line bg-surface px-2 text-center disabled:opacity-50"
            />
            hari
          </label>
        </fieldset>
        <p aria-live="polite" className="text-sm">
          {!audienceReady && <span className="text-danger">Isi jumlah hari antara 1 dan 365.</span>}
          {audienceReady && counts && (
            <>
              Akan sampai ke <strong>{counts.devices}</strong> perangkat milik <strong>{counts.users}</strong> pengguna.
            </>
          )}
          {audienceReady && !counts && <span className="text-muted">Menghitung penerima…</span>}
        </p>
      </section>

      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}>
          {notice.text}
        </p>
      )}

      {progress && busy === 'send' && (
        <section className={box} aria-live="polite">
          <p className="font-medium">Mengirim “{progress.title}”…</p>
          <progress className="h-3 w-full" max={Math.max(progress.recipients, 1)} value={progress.sent + progress.failed} />
          <p className="text-sm tabular-nums text-muted">
            {progress.sent} terkirim, {progress.failed} gagal, dari sekitar {progress.recipients} perangkat. Jangan tutup halaman ini.
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={secondary} disabled={!messageReady || busy !== null} onClick={sendTest}>
          <Bell size={16} aria-hidden="true" />
          Kirim uji ke perangkat ini
        </button>
        <button type="button" className={primary} disabled={!messageReady || !audienceReady || !counts || counts.devices === 0 || busy !== null} onClick={() => setConfirmOpen(true)}>
          <Send size={16} aria-hidden="true" />
          Kirim ke semua
        </button>
      </div>

      <section className={box}>
        <h2 className="font-semibold">Riwayat siaran</h2>
        {campaigns.length === 0 && <p className="text-sm text-muted">Belum ada siaran.</p>}
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className="space-y-1 rounded-xl border border-line bg-cream p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{c.title}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${c.status === 'done' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                  {c.status === 'done' ? 'Selesai' : 'Belum selesai'}
                </span>
              </div>
              <p className="break-words text-muted">{c.body}</p>
              <p className="tabular-nums text-muted">
                {when(c.created_at)}, {audienceLabel(c.audience, c.inactive_days)}: {c.sent} terkirim, {c.failed} gagal, {c.removed} dibersihkan dari {c.recipients} perangkat.
              </p>
              {c.status === 'sending' && (
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => run(c)}>
                  Lanjutkan pengiriman
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Kirim ke semua?">
        <div className="space-y-4">
          <Preview title={title.trim()} body={body.trim()} />
          <p className="text-sm">
            Notifikasi ini akan dikirim ke <strong>{counts?.devices ?? 0}</strong> perangkat ({audienceLabel(audience, audience === 'inactive' ? daysNumber : null)}).
            Setelah dikirim, siaran berikutnya baru bisa dibuat 24 jam kemudian, dan pengiriman tidak bisa dibatalkan.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondary} onClick={() => setConfirmOpen(false)}>Batal</button>
            <button type="button" className={primary} onClick={startBroadcast}>Kirim sekarang</button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
