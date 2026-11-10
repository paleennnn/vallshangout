// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

// Komponen helper yang sengaja melempar error untuk pengujian
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Boom! Simulasi kegagalan komponen');
  }
  return <div>Komponen Berfungsi Normal</div>;
}

describe('<ErrorBoundary />', () => {
  it('merender children jika tidak ada error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Komponen Berfungsi Normal')).toBeTruthy();
  });

  it('menangkap error dan menampilkan fallback standar beserta pesan error', () => {
    // Matikan log error console selama test ini agar output test bersih
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Komponen ini mengalami kendala')).toBeTruthy();
    expect(screen.getByText('Boom! Simulasi kegagalan komponen')).toBeTruthy();
    expect(screen.getByText('Coba Muat Ulang Bagian Ini')).toBeTruthy();

    spy.mockRestore();
  });

  it('menampilkan fallback custom jika disediakan sebagai elemen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Fallback Kustom</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Fallback Kustom')).toBeTruthy();
    expect(screen.queryByText('Komponen ini mengalami kendala')).toBeNull();

    spy.mockRestore();
  });

  it('menampilkan fallback custom function yang menerima reset callback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <div>
            <span>Terjadi: {error.message}</span>
            <button type="button" onClick={reset}>
              Reset Ulang
            </button>
          </div>
        )}
      >
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Terjadi: Boom! Simulasi kegagalan komponen')).toBeTruthy();
    expect(screen.getByText('Reset Ulang')).toBeTruthy();

    spy.mockRestore();
  });

  it('mendukung mode compact', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary compact title="Form Rusak">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Form Rusak')).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();

    spy.mockRestore();
  });
});

