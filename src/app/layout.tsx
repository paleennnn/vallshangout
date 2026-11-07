import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SerwistProvider } from '@serwist/turbopack/react';
import './globals.css';
import { SupabaseProvider } from '@/components/SupabaseProvider';
import { OfflineBanner } from '@/components/OfflineBanner';

const APP_NAME = 'VallsHangout';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: `${APP_NAME} — nongkrong, putuskan, patungan`, template: `%s · ${APP_NAME}` },
  description:
    'Bingung mau nongkrong di mana? Spin wheel, voting tempat, dan bagi tagihan yang adil (service & tax proporsional).',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f0a1f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">
        {/* Service worker dimatikan di mode dev supaya cache tidak mengganggu hot reload. */}
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === 'development'}>
          <SupabaseProvider>
            <OfflineBanner />
            {children}
          </SupabaseProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
