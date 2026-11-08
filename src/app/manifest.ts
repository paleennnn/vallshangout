import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'VallsHangout',
    short_name: 'VallsHangout',
    description: 'Spin wheel pilih tempat nongkrong, voting, dan patungan yang adil.',
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fff7ed',
    theme_color: '#fff7ed',
    categories: ['lifestyle', 'finance', 'social'],
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Kalkulator patungan',
        url: '/calculator',
        icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Roda putar',
        url: '/spin',
        icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Hangout baru',
        url: '/new',
        icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
