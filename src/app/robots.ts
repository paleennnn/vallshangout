import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://vallshangout.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/h/',
          '/api/',
          '/new',
          '/hangouts',
          '/~offline',
          '/serwist/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

