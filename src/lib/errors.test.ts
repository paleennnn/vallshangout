import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('membaca Error biasa, objek berpesan (galat Supabase), dan jatuh ke fallback untuk sisanya', () => {
    expect(errorMessage(new Error('boom'), 'x')).toBe('boom');
    expect(errorMessage({ message: 'new row violates row-level security policy', code: '42501' }, 'x')).toBe('new row violates row-level security policy');
    expect(errorMessage({ message: '' }, 'cadangan')).toBe('cadangan');
    expect(errorMessage('teks', 'cadangan')).toBe('cadangan');
    expect(errorMessage(null, 'cadangan')).toBe('cadangan');
  });
});
