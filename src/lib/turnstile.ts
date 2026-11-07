/**
 * Cloudflare Turnstile (opsional). Hanya dipakai bila CAPTCHA di Supabase Auth diaktifkan
 * dan NEXT_PUBLIC_TURNSTILE_SITE_KEY diisi. Token diminta tepat sebelum signInAnonymously().
 */
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      appearance?: 'always' | 'execute' | 'interaction-only';
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'timeout-callback'?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile gagal dimuat')),
    );
    script.addEventListener('error', () => reject(new Error('Turnstile gagal dimuat')));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  const turnstile = await loadScript();
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    // Widget hanya muncul bila Cloudflare butuh interaksi manusia.
    host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999';
    document.body.appendChild(host);

    let id = '';
    const done = () => {
      try {
        if (id) turnstile.remove(id);
      } catch {
        /* abaikan */
      }
      host.remove();
    };

    id = turnstile.render(host, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token) => {
        done();
        resolve(token);
      },
      'error-callback': () => {
        done();
        reject(new Error('Verifikasi CAPTCHA gagal'));
      },
      'timeout-callback': () => {
        done();
        reject(new Error('Verifikasi CAPTCHA kedaluwarsa'));
      },
    });
  });
}
