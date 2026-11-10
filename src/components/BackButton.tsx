'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export interface BackButtonProps {
  fallback?: string;
  label?: string;
  className?: string;
}

export function BackButton({
  fallback = '/',
  label = 'Kembali',
  className = 'hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:inline-flex',
}: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button type="button" onClick={handleBack} className={`${className} cursor-pointer`}>
      <ArrowLeft size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

