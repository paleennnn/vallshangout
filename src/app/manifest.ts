import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'VallsHangout',
    short_name: 'Valls',
    description: 'Spin wheel pilih tempat nongkrong, voting, dan patungan yang adil.',
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0a1f',
    theme_color: '#0f0a1f',
    categories: ['lifestyle', 'finance', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Kalkulator patungan', url: '/calculator', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Hangout baru', url: '/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
