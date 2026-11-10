// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/hangouts' }));

import { SupabaseProvider } from './SupabaseProvider';
import { HangoutsHub } from './HangoutsHub';

afterEach(cleanup);

describe('<HangoutsHub /> saat layanan offline', () => {
  it('tetap menampilkan aksi gabung dan pesan pemeliharaan, tanpa crash', async () => {
    render(
      <SupabaseProvider>
        <HangoutsHub />
      </SupabaseProvider>,
    );
    expect(await screen.findByText(/Belum ada\. Buat hangout/)).toBeTruthy();
    expect(screen.getByText(/Layanan hangout online sedang dalam pemeliharaan/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Kode 8 karakter')).toBeTruthy();
  });
});
