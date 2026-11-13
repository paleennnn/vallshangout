import type { NextConfig } from 'next';
import { withSerwist } from '@serwist/turbopack';

const isDevelopment = process.env.NODE_ENV === 'development';
const scriptSource = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'", // OCR di browser (Tesseract.js dan PaddleOCR) memakai WebAssembly
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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
