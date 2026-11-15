import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

const root = process.cwd();
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { headers: Rule[] };

async function nextRules(): Promise<Rule[]> {
  const mod = await import('../../next.config');
  const config = mod.default as unknown as { headers: () => Promise<Rule[]> };
  return config.headers();
}
const find = (rules: Rule[], source: string) => rules.find((r) => r.source === source);
const value = (rule: Rule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;

describe('header keamanan dan cache: next.config.ts dan vercel.json harus sama', () => {
  it('CSP identik di kedua tempat (keduanya diterapkan browser sekaligus, jadi harus selaras)', async () => {
    const fromNext = value(find(await nextRules(), '/(.*)'), 'Content-Security-Policy');
    const fromVercel = value(find(vercel.headers, '/(.*)'), 'Content-Security-Policy');
    expect(fromNext).toBeTruthy();
    expect(fromVercel).toBe(fromNext);
  });

  it('CSP mengizinkan WebAssembly (Tesseract.js) dan pekerja dari domain sendiri', async () => {
    const csp = value(find(await nextRules(), '/(.*)'), 'Content-Security-Policy')!;
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
    expect(csp).toMatch(/worker-src 'self' blob:/);
    expect(csp).toMatch(/connect-src 'self'/);
  });

  it('semua header keamanan lain juga sama di kedua tempat', async () => {
    const a = find(await nextRules(), '/(.*)')!.headers.map((h) => `${h.key}: ${h.value}`).sort();
    const b = find(vercel.headers, '/(.*)')!.headers.map((h) => `${h.key}: ${h.value}`).sort();
    expect(b).toEqual(a);
  });

  it('aset OCR di-cache sehari plus stale-while-revalidate, nilainya sama di kedua tempat', async () => {
    const fromNext = value(find(await nextRules(), '/ocr/:path*'), 'Cache-Control');
    const fromVercel = value(find(vercel.headers, '/ocr/(.*)'), 'Cache-Control');
    expect(fromNext).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(fromVercel).toBe(fromNext);
  });

  it('cache panjang hanya untuk /ocr/, tidak untuk halaman lain', async () => {
    const rules = await nextRules();
    const broad = find(rules, '/(.*)')!;
    expect(value(broad, 'Cache-Control')).toBeUndefined();
    expect(find(vercel.headers, '/(.*)')!.headers.some((h) => h.key === 'Cache-Control')).toBe(false);
  });
});
