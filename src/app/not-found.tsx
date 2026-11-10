import type { Metadata } from 'next';
import { NotFoundContent } from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: 'Jangan nyari yang gaada ya😋',
  description: 'Halaman yang kamu cari tidak ditemukan di VallsHangout.',
};

export default function NotFound() {
  return <NotFoundContent />;
}

