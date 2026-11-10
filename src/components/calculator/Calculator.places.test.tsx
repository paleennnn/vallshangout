// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PLACES_KEY, SAMPLE_PLACES, createPlace } from '@/lib/places/store';
import { Calculator } from './Calculator';

const cafe = createPlace(SAMPLE_PLACES[0]); // service 5, pajak 10, dari subtotal + service
const billiard = createPlace(SAMPLE_PLACES[1]); // service 0, pajak 10, dari subtotal saja

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/calculator');
});
afterEach(cleanup);

const seed = () => localStorage.setItem(PLACES_KEY, JSON.stringify([cafe, billiard]));
const val = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('<Calculator /> dengan tempat tersimpan', () => {
  it('datang dari halaman Tempat (?place=ID): nama acara, service, dan pajak terisi lalu URL dibersihkan', () => {
    seed();
    window.history.replaceState(null, '', `/calculator?place=${billiard.id}`);
    render(<Calculator />);
    expect(val('Nama acara')).toBe('Billiard 88');
    expect(val('Service %')).toBe('0');
    expect(val('Pajak %')).toBe('10');
    expect((screen.getByLabelText(/Pajak dihitung dari/) as HTMLInputElement).checked).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('id tempat yang tidak dikenal diabaikan tanpa error', () => {
    seed();
    window.history.replaceState(null, '', '/calculator?place=tidak-ada');
    render(<Calculator />);
    expect(val('Nama acara')).toBe('Nongkrong');
    expect(val('Service %')).toBe('5');
  });

  it('pemilih tempat mengisi nilai tempat yang dipilih', () => {
    seed();
    render(<Calculator />);
    fireEvent.change(screen.getByLabelText('Isi dari tempat tersimpan'), { target: { value: cafe.id } });
    expect(val('Nama acara')).toBe('Cafe A');
    expect(val('Service %')).toBe('5');
    expect((screen.getByLabelText(/Pajak dihitung dari/) as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText('Isi dari tempat tersimpan'), { target: { value: billiard.id } });
    expect(val('Service %')).toBe('0');
  });

  it('tanpa tempat tersimpan: tampil ajakan menyimpan tempat, bukan pemilih', () => {
    render(<Calculator />);
    expect(screen.queryByLabelText('Isi dari tempat tersimpan')).toBeNull();
    const link = screen.getByRole('link', { name: /Simpan tempat langganan/ });
    expect(link.getAttribute('href')).toBe('/places');
  });
});

describe('<Calculator /> dari room (?title=&service=&tax=&onservice=)', () => {
  it('mengisi nama, service, pajak, dan dasar pajak lalu membersihkan URL', () => {
    window.history.replaceState(null, '', '/calculator?title=Warung%20Baru&service=0&tax=11&onservice=0');
    render(<Calculator />);
    expect(val('Nama acara')).toBe('Warung Baru');
    expect(val('Service %')).toBe('0');
    expect(val('Pajak %')).toBe('11');
    expect((screen.getByLabelText(/Pajak dihitung dari/) as HTMLInputElement).checked).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('parameter sampah tidak mengubah apa pun', () => {
    window.history.replaceState(null, '', '/calculator?service=999&tax=abc');
    render(<Calculator />);
    expect(val('Service %')).toBe('5');
    expect(val('Pajak %')).toBe('10');
  });
});
