import type { NextConfig } from 'next';
import { withSerwist } from '@serwist/turbopack';

const isDevelopment = process.env.NODE_ENV === 'development';
const scriptSource = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'", // OCR di browser (Tesseract.js) memakai WebAssembly
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  'https://challenges.cloudflare.com',
].join(' ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' ws: https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; manifest-src 'self'`,
  },
  { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

/**
 * Aset OCR (model dan WASM, sekitar 6 MB) di public/ tidak ber-hash, jadi tanpa ini browser
 * mengecek ulang tiap berkas pada setiap sesi. Sehari dianggap segar, dan seminggu boleh dipakai
 * sambil diperbarui di latar belakang, sehingga scan berikutnya tidak menunggu jaringan.
 * Nilai yang sama dipasang di vercel.json (yang melayani berkas statis di produksi).
 */
export const OCR_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/ocr/:path*',
        headers: [{ key: 'Cache-Control', value: OCR_CACHE_CONTROL }],
      },
    ];
  },
};

export default withSerwist(nextConfig);
