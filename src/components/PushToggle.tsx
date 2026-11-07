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

  async function enable() {
    setMessage(null);
    setState('busy');
    try {
      if (!supabase) throw new Error('Supabase belum dikonfigurasi');
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
      setState('off');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Gagal mematikan notifikasi');
      setState('on');
    }
  }

  const hints: Partial<Record<State, string>> = {
    unsupported:
      'Browser ini belum mendukung notifikasi. Di iPhone/iPad, pasang dulu ke Layar Utama (iOS 16.4+).',
    'no-config': 'Notifikasi belum dikonfigurasi (isi kunci VAPID di .env).',
    'no-sw': 'Notifikasi aktif setelah aplikasi dibuka dari build produksi (service worker mati di mode dev).',
    denied: 'Notifikasi diblokir di pengaturan browser/perangkat.',
  };

  return (
    <div className="space-y-2">
      {state === 'off' && (
        <button type="button" onClick={enable} className="inline-flex items-center gap-2 rounded-control bg-sand px-4 py-2 text-sm font-semibold hover:bg-sand-strong">
          <Bell size={16} aria-hidden="true" />
          Aktifkan notifikasi
        </button>
      )}
      {state === 'on' && (
        <button type="button" onClick={disable} className="inline-flex items-center gap-2 rounded-control bg-sand px-4 py-2 text-sm font-semibold hover:bg-sand-strong">
          <BellOff size={16} aria-hidden="true" />
          Matikan notifikasi
        </button>
      )}
      {(state === 'busy' || state === 'checking') && <p className="text-sm text-muted">Memeriksa…</p>}
      {hints[state] && <p className="text-sm text-muted">{hints[state]}</p>}
      {message && <p className="text-sm text-danger">{message}</p>}
    </div>
  );
}
