import Image from 'next/image';
import Link from 'next/link';

export function WheelMark({ size = 22 }: { size?: number }) {
  // roda 8 segmen: krem & charcoal di atas lingkaran oranye
  const segs = Array.from({ length: 8 }, (_, i) => {
    const a0 = ((i * 45 - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * 45 - 90) * Math.PI) / 180;
    const p = (a: number) => `${12 + 9 * Math.cos(a)},${12 + 9 * Math.sin(a)}`;
    return <path key={i} d={`M12,12 L${p(a0)} A9,9 0 0 1 ${p(a1)} Z`} fill={i % 2 ? '#292524' : '#fff7ed'} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11.5" fill="#f97316" />
      {segs}
      <circle cx="12" cy="12" r="2.2" fill="#f97316" />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <Image
            src="/images/LogoFill_noBg.png"
            alt="VallsHangout Logo"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            priority
          />
          <span>vallshangout</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/calculator" className="rounded-control px-3 py-2 hover:bg-sand">
            Kalkulator
          </Link>
          <Link href="/new" className="rounded-control border border-line-strong bg-surface px-3 py-2 hover:bg-sand">
            Buat hangout
          </Link>
        </nav>
      </div>
    </header>
  );
}
