import type { Metadata } from 'next';
import { OcrLab } from '@/components/lab/OcrLab';

export const metadata: Metadata = {
  title: 'Uji OCR struk',
  robots: { index: false, follow: false },
};

export default function OcrLabPage() {
  return <OcrLab />;
}
