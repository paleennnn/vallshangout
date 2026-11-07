import { createSerwistRoute } from '@serwist/turbopack';

// Revision = versi build; berubah tiap deploy supaya halaman yang di-precache ikut diperbarui.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_VERSION ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  // Halaman yang HARUS tersedia offline sejak aplikasi dipasang.
  additionalPrecacheEntries: [
    { url: '/~offline', revision },
    { url: '/calculator', revision },
    { url: '/', revision },
    { url: '/fonts/plus-jakarta-sans-latin-wght.woff2', revision },
    { url: '/fonts/ibm-plex-mono-latin-400.woff2', revision },
    { url: '/fonts/ibm-plex-mono-latin-500.woff2', revision },
  ],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
