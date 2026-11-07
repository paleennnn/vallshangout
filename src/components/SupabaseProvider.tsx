'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { getTurnstileToken } from '@/lib/turnstile';

interface SupabaseContextValue {
  /** null bila env Supabase belum diisi. */
  supabase: SupabaseClient | null;
  session: Session | null;
  /** Sesi dipulihkan dari penyimpanan lokal? (false sampai pengecekan awal selesai) */
  restored: boolean;
  /**
   * Pastikan ada sesi. Pengunjung baru otomatis login ANONIM, tapi hanya saat fitur
   * yang butuh backend dipakai (bukan saat membuka kalkulator) supaya tidak membuat
   * akun anonim sia-sia.
   */
  ensureSession: () => Promise<Session>;
}

const SupabaseContext = createContext<SupabaseContextValue>({
  supabase: null,
  session: null,
  restored: false,
  ensureSession: () => Promise.reject(new Error('Supabase belum dikonfigurasi')),
});

export function useSupabase() {
  return useContext(SupabaseContext);
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [restored, setRestored] = useState(false);
  const pending = useRef<Promise<Session> | null>(null);

  useEffect(() => {
    const client = getSupabase();
    setSupabase(client);
    if (!client) {
      setRestored(true);
      return;
    }
    let active = true;
    // Baca sesi dari localStorage (tanpa jaringan).
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setRestored(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next); // jangan panggil API Supabase lain di dalam callback ini
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ensureSession = useCallback(async (): Promise<Session> => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase belum dikonfigurasi');

    const { data } = await client.auth.getSession();
    if (data.session) return data.session;

    if (!navigator.onLine) throw new Error('Sedang offline — sambungkan internet dulu.');

    pending.current ??= (async () => {
      try {
        const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        const captchaToken = siteKey ? await getTurnstileToken(siteKey) : undefined;
        const { data: signIn, error } = await client.auth.signInAnonymously(
          captchaToken ? { options: { captchaToken } } : undefined,
        );
        if (error || !signIn.session) throw error ?? new Error('Gagal membuat sesi anonim');
        return signIn.session;
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, []);

  const value = useMemo(
    () => ({ supabase, session, restored, ensureSession }),
    [supabase, session, restored, ensureSession],
  );
  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}
