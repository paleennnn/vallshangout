import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SerwistProvider } from '@serwist/turbopack/react';
import './globals.css';
import { SupabaseProvider } from '@/components/SupabaseProvider';
import { OfflineBanner } from '@/components/OfflineBanner';
import { BottomNav } from '@/components/BottomNav';
import { SiteHeader } from '@/components/SiteHeader';

const APP_NAME = 'VallsHangout';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: `${APP_NAME}: nongkrong, putuskan, patungan`, template: `%s | ${APP_NAME}` },
  description:
    'Bingung mau nongkrong di mana? Spin wheel, voting tempat, dan bagi tagihan yang adil (service & tax proporsional).',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#fff7ed',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link
          rel="preload"
          href="/fonts/plus-jakarta-sans-latin-wght.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Service worker dimatikan di mode dev supaya cache tidak mengganggu hot reload. */}
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === 'development'}>
          <SupabaseProvider>
            <OfflineBanner />
            <SiteHeader />
            {children}
            {/* ruang untuk bottom nav mengambang (mobile) */}
            <div aria-hidden="true" className="h-[calc(5.75rem+env(safe-area-inset-bottom))] md:hidden" />
            <BottomNav />
          </SupabaseProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
