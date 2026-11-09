// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionRoot } from '@/components/MotionRoot';
import { Wheel, boundsFor } from './Wheel';

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

/** Hanya irisan roda (bukan penunjuk): path yang berawal dari pusat roda. */
const slices = (container: HTMLElement) =>
  [...container.querySelectorAll('svg path')].filter((p) => (p.getAttribute('d') ?? '').startsWith('M160,160'));

describe('boundsFor', () => {
  it('bobot sama => irisan sama besar, dan batasnya selalu berakhir di 360', () => {
    const b = boundsFor([1, 1, 1, 1]);
    expect(b).toEqual([0, 90, 180, 270, 360]);
  });

  it('lebar irisan sebanding bobot', () => {
    const b = boundsFor([3, 1]);
    expect(b).toEqual([0, 270, 360]);
  });

  it('akumulasi bilangan pecahan tidak menyisakan celah di akhir', () => {
    const b = boundsFor([0.4, 1.5, 0.7, 0.3, 0.9, 1.1, 0.35]);
    expect(b[b.length - 1]).toBe(360);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
  });
});

describe('<Wheel />', () => {
  const setup = (props: Partial<React.ComponentProps<typeof Wheel>>) =>
    render(
      <MotionRoot>
        <Wheel labels={['A', 'B']} {...props} />
      </MotionRoot>,
    );

  it('hasil selalu indeks yang valid', () => {
    const onResult = vi.fn();
    setup({ labels: ['A', 'B', 'C'], onResult });
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByRole('button', { name: 'Putar roda' }));
    expect(onResult).toHaveBeenCalledTimes(30);
    for (const [index] of onResult.mock.calls) expect([0, 1, 2]).toContain(index);
  });

  it('dengan bobot 3:1, pilihan pertama menang sekitar 75%', () => {
    const onResult = vi.fn();
    setup({ labels: ['Lama', 'Baru'], weights: [3, 1], onResult });
    const spin = screen.getByRole('button', { name: 'Putar roda' });
    for (let i = 0; i < 600; i++) fireEvent.click(spin);
    const first = onResult.mock.calls.filter(([index]) => index === 0).length;
    // harapan 450, simpangan baku sekitar 10,6: batas 380..520 sangat longgar
    expect(first).toBeGreaterThan(380);
    expect(first).toBeLessThan(520);
  });

  it('irisan berbobot besar digambar lebih lebar daripada yang kecil', () => {
    const { container } = setup({ labels: ['Besar', 'Kecil'], weights: [3, 1] });
    const paths = slices(container);
    expect(paths).toHaveLength(2);
    // irisan pertama 270 derajat => memakai large-arc-flag 1; irisan kedua 90 derajat => 0
    expect(paths[0].getAttribute('d')).toContain('A150,150 0 1 1');
    expect(paths[1].getAttribute('d')).toContain('A150,150 0 0 1');
  });

  it('bobot tidak valid atau jumlahnya tidak cocok diabaikan (jatuh ke irisan sama besar)', () => {
    const { container } = setup({ labels: ['A', 'B'], weights: [1, 0] });
    const paths = slices(container);
    expect(paths[0].getAttribute('d')).toContain('A150,150 0 0 1');
  });

  it('kurang dari 2 pilihan: tombol putar nonaktif', () => {
    const onResult = vi.fn();
    setup({ labels: ['Sendiri'], onResult });
    expect((screen.getByRole('button', { name: 'Putar roda' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
