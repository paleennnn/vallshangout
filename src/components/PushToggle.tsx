'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';

type State =
  | 'checking'
  | 'unsupported'
  | 'no-config'
  | 'no-sw'
  | 'denied'
  | 'off'
  | 'on'
  | 'busy';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const { supabase, ensureSession } = useSupabase();
  const [state, setState] = useState<State>('checking');
  const [message, setMessage] = useState<string | null>(null);
  /** Saklar "pengumuman" perangkat ini; null = belum diketahui. */
  const [announce, setAnnounce] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!VAPID_PUBLIC_KEY) return active && setState('no-config');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return active && setState('unsupported');
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return active && setState('no-sw');
      if (Notification.permission === 'denied') return active && setState('denied');
      const sub = await reg.pushManager.getSubscription();
      if (active) setState(sub ? 'on' : 'off');
    })();
    return () => {
      active = false;
    };
  }, []);

  // Saat notifikasi menyala, baca saklar pengumuman milik perangkat ini
  useEffect(() => {
    if (state !== 'on' || !supabase) return;
    let active = true;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      const { data } = await supabase.from('push_subscriptions').select('announcements').eq('endpoint', sub.endpoint).maybeSingle();
      if (active) setAnnounce(data ? Boolean(data.announcements) : null);
    })();
    return () => {
      active = false;
    };
  }, [state, supabase]);

  async function toggleAnnounce(next: boolean) {
    setMessage(null);
    setAnnounce(next);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const { error } = sub
      ? await supabase!.from('push_subscriptions').update({ announcements: next }).eq('endpoint', sub.endpoint)
      : { error: new Error('no subscription') };
    if (error) {
      setAnnounce(!next);
      setMessage('Gagal menyimpan pengaturan pengumuman.');
    }
  }

  async function enable() {
    setMessage(null);
    setState('busy');
    try {
      if (!supabase) throw new Error('Layanan notifikasi sedang tidak tersedia.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      await ensureSession();
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
        }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc('register_push_subscription', {
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setState('on');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Gagal mengaktifkan notifikasi');
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setAnnounce(null);
      setState('off');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Gagal mematikan notifikasi');
      setState('on');
    }
  }

  const hints: Partial<Record<State, string>> = {
    unsupported:
      'Browser ini belum mendukung notifikasi. Di iPhone/iPad, pasang dulu ke Layar Utama (iOS 16.4+).',
    'no-config': 'Fitur notifikasi sedang dalam pemeliharaan.',
    'no-sw': 'Notifikasi aktif setelah aplikasi dibuka dari build produksi (service worker mati di mode dev).',
    denied: 'Notifikasi diblokir di pengaturan browser/perangkat.',
  };

  return (
    <>
      {state === 'off' && (
        <button
          type="button"
          onClick={enable}
          className="inline-flex h-11 items-center gap-2 rounded-control bg-sand px-4 text-sm font-semibold hover:bg-sand-strong"
        >
          <Bell size={16} aria-hidden="true" />
          Aktifkan notifikasi
        </button>
      )}
      {state === 'on' && (
        <button
          type="button"
          onClick={disable}
          className="inline-flex h-11 items-center gap-2 rounded-control bg-sand px-4 text-sm font-semibold hover:bg-sand-strong"
        >
          <BellOff size={16} aria-hidden="true" />
          Matikan notifikasi
        </button>
      )}
      {state === 'on' && announce !== null && (
        <label className="flex basis-full items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={announce}
            onChange={(e) => toggleAnnounce(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span>
            <span className="font-medium">Terima pengumuman dari Valls</span>
            <span className="block text-muted">Kabar sesekali dari tim Valls. Notifikasi tagihan dan transfer tetap aktif.</span>
          </span>
        </label>
      )}
      {(state === 'busy' || state === 'checking') && (
        <span className="inline-flex h-11 items-center px-1 text-sm text-muted">Memeriksa…</span>
      )}
      {hints[state] && <p className="basis-full text-sm text-muted">{hints[state]}</p>}
      {message && <p className="basis-full text-sm text-danger">{message}</p>}
    </>
  );
}
