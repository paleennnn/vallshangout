'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS menyamar sebagai Mac
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true); // true dulu supaya tidak berkedip
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone) return null;

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
        className="inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-hover"
      >
        <Download size={16} aria-hidden="true" />
        Install aplikasi
      </button>
    );
  }

  if (ios) {
    return (
      <p className="text-sm text-muted">
        Di iPhone/iPad: ketuk <b>Bagikan</b> lalu <b>Tambahkan ke Layar Utama</b> untuk memasang
        (dan untuk menerima notifikasi).
      </p>
    );
  }
  return null;
}
