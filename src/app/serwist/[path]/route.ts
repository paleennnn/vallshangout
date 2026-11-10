import { createSerwistRoute } from '@serwist/turbopack';

// Revision = versi build; berubah tiap deploy supaya halaman yang di-precache ikut diperbarui.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_VERSION ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  // Halaman yang HARUS tersedia offline sejak aplikasi dipasang.
  // Aset statis di folder public/ (seperti font & icon) sudah otomatis di-precache oleh Serwist.
  additionalPrecacheEntries: [
    { url: '/~offline', revision },
    { url: '/calculator', revision },
    { url: '/spin', revision },
    { url: '/places', revision },
    { url: '/hangouts', revision },
    { url: '/', revision },
  ],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
