// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const push = vi.fn();
  const calls: string[] = [];
  const state = { profileName: 'Anon', profileUpdateError: null as { message: string } | null };
  const ctx = {
    supabase: null as unknown,
    session: null as unknown,
    restored: true,
    ensureSession: vi.fn(),
  };
  return { push, calls, state, ctx };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/components/SupabaseProvider', () => ({ useSupabase: () => h.ctx }));

import { NewHangoutForm } from './NewHangoutForm';

function fakeSupabase() {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve({ data: { display_name: h.state.profileName }, error: null });
      q.single = () => Promise.resolve({ data: { invite_code: 'ABCD2345' }, error: null });
      q.update = (payload: unknown) => {
        h.calls.push(`${table}.update:${JSON.stringify(payload)}`);
        return { eq: () => Promise.resolve({ error: h.state.profileUpdateError }) };
      };
      q.insert = (payload: unknown) => {
        h.calls.push(`${table}.insert:${JSON.stringify(payload)}`);
        return q;
      };
      return q;
    },
  };
}

beforeEach(() => {
  h.push.mockReset();
  h.calls.length = 0;
  h.state.profileName = 'Anon';
  h.state.profileUpdateError = null;
  h.ctx.supabase = fakeSupabase();
  h.ctx.session = null;
  h.ctx.ensureSession.mockReset().mockResolvedValue({ user: { id: 'u1' } });
});
afterEach(cleanup);

const nameInput = () => screen.getByLabelText('Nama kamu') as HTMLInputElement;
const createBtn = () => screen.getByRole('button', { name: /Buat & dapatkan link/ }) as HTMLButtonElement;

describe('<NewHangoutForm />', () => {
  it('nama host wajib: tombol nonaktif sampai nama diisi', () => {
    render(<NewHangoutForm />);
    expect(createBtn().disabled).toBe(true);
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(createBtn().disabled).toBe(true);
    fireEvent.change(nameInput(), { target: { value: 'Febyan' } });
    expect(createBtn().disabled).toBe(false);
    expect(nameInput().maxLength).toBe(40);
  });

  it('memperbarui nama profil lebih dulu, baru membuat hangout, lalu pindah ke room', async () => {
    render(<NewHangoutForm />);
    fireEvent.change(nameInput(), { target: { value: '  Febyan  ' } });
    fireEvent.change(screen.getByLabelText('Nama acara'), { target: { value: 'Malming' } });
    fireEvent.click(createBtn());

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/h/ABCD2345'));
    expect(h.calls).toEqual([
      'profiles.update:{"display_name":"Febyan"}',
      'hangouts.insert:{"title":"Malming"}',
    ]);
  });

  it('gagal memperbarui profil: hangout tidak dibuat dan galat ditampilkan', async () => {
    h.state.profileUpdateError = { message: 'permission denied' };
    render(<NewHangoutForm />);
    fireEvent.change(nameInput(), { target: { value: 'Febyan' } });
    fireEvent.click(createBtn());

    expect((await screen.findByText(/permission denied/)).textContent).toBeTruthy();
    expect(h.calls.some((c) => c.startsWith('hangouts.insert'))).toBe(false);
    expect(h.push).not.toHaveBeenCalled();
    expect(createBtn().disabled).toBe(false);
  });

  it('pengguna lama: nama terisi dari profil; nama bawaan "Anon" tidak dipakai', async () => {
    h.ctx.session = { user: { id: 'u1' } };
    h.state.profileName = 'Budi';
    const { unmount } = render(<NewHangoutForm />);
    await waitFor(() => expect(nameInput().value).toBe('Budi'));
    unmount();

    h.state.profileName = 'Anon';
    render(<NewHangoutForm />);
    await new Promise((r) => setTimeout(r, 20));
    expect(nameInput().value).toBe('');
  });

  it('nama yang sedang diketik tidak ditimpa nama dari profil', async () => {
    h.ctx.session = { user: { id: 'u1' } };
    h.state.profileName = 'Budi';
    render(<NewHangoutForm />);
    fireEvent.change(nameInput(), { target: { value: 'Siti' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(nameInput().value).toBe('Siti');
  });
});
