import { describe, expect, it } from 'vitest';
import { groupRows } from './rows';
import type { OcrWord } from './types';

const w = (text: string, x0: number, y0: number, extra: Partial<OcrWord> = {}): OcrWord => ({
  text,
  x0,
  y0,
  x1: x0 + text.length * 10,
  y1: y0 + 20,
  ...extra,
});

describe('groupRows', () => {
  it('mengelompokkan kata menurut posisi vertikal dan mengurutkan dari kiri ke kanan', () => {
    const rows = groupRows([w('28.000', 300, 52), w('Croissant', 10, 50), w('Butter', 110, 51), w('Matcha', 10, 90), w('32.000', 300, 92)]);
    expect(rows.map((r) => r.text)).toEqual(['Croissant Butter  28.000', 'Matcha  32.000']);
  });

  it('jarak lebar antar kata diberi dua spasi, jarak rapat satu spasi', () => {
    const [row] = groupRows([w('Es', 10, 10), w('Teh', 40, 10), w('7.000', 400, 10)]);
    expect(row.text).toBe('Es Teh  7.000');
  });

  it('foto sedikit miring: harga yang sedikit lebih rendah tetap satu baris dengan namanya', () => {
    const rows = groupRows([w('Nasi', 10, 100), w('35.000', 400, 108), w('Ayam', 10, 140), w('30.000', 400, 148)]);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toContain('35.000');
    expect(rows[1].text).toContain('30.000');
  });

  it('memakai nomor baris dari engine bila ada, walau posisi vertikalnya berjauhan', () => {
    const rows = groupRows([w('Nasi', 10, 100, { line: 0 }), w('35.000', 400, 130, { line: 0 }), w('Ayam', 10, 160, { line: 1 })]);
    expect(rows.map((r) => r.text)).toEqual(['Nasi  35.000', 'Ayam']);
  });

  it('keyakinan terendah di baris dicatat', () => {
    const [row] = groupRows([w('Nasi', 10, 10, { conf: 90 }), w('35.0O0', 100, 10, { conf: 41 })]);
    expect(row.minConf).toBe(41);
  });

  it('kata kosong diabaikan dan masukan kosong menghasilkan daftar kosong', () => {
    expect(groupRows([])).toEqual([]);
    expect(groupRows([w('  ', 10, 10)])).toEqual([]);
  });

  it('baris terurut dari atas ke bawah walau masukan acak', () => {
    const rows = groupRows([w('C', 10, 200), w('A', 10, 20), w('B', 10, 110)]);
    expect(rows.map((r) => r.text)).toEqual(['A', 'B', 'C']);
  });
});
