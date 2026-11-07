'use client';

const nf = new Intl.NumberFormat('id-ID');

/**
 * Input rupiah: tampil "28.000", nilai bilangan bulat. `null` = kosong.
 * allowNegative untuk pembulatan struk (mis. -50).
 */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  allowNegative = false,
  className = '',
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  allowNegative?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode={allowNegative ? 'text' : 'numeric'}
      value={value === null ? '' : nf.format(value)}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        const negative = allowNegative && raw.trim().startsWith('-');
        const digits = raw.replace(/\D/g, '');
        if (!digits) return onChange(negative ? 0 : null);
        const n = Math.min(Number(digits), 9_000_000_000);
        onChange(negative ? -n : n);
      }}
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-right tabular-nums focus:border-brand ${className}`}
    />
  );
}
