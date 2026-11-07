import { formatIDR } from '@/lib/engine/split';
import { RESULT1 } from './demoData';

const taxParts = RESULT1.shares.map((s) => formatIDR(s.taxAmount).replace('Rp', '').trim());
const taxTotal = formatIDR(RESULT1.shares.reduce((a, s) => a + s.taxAmount, 0));

const ROWS = [
  {
    title: 'Pilih tempat tanpa debat',
    body: 'Putar roda dari daftar tempat grupmu. Tempat yang lama tidak didatangi dapat peluang lebih besar. Hasilnya diundi di server, jadi semua orang melihat hasil yang sama, dan tiap orang boleh veto sekali.',
  },
  {
    title: 'Service dan pajak ikut porsi',
    body: `Pajak ${taxTotal} di contoh tadi menjadi ${taxParts.join(', ')} sesuai pesanan masing-masing. Total selalu pas dengan struk, tanpa selisih satu rupiah pun.`,
  },
  {
    title: 'Transfer sesedikit mungkin',
    body: 'Gantian talangin di beberapa tempat? Sampai 14 orang, jumlah transfernya dicari yang paling sedikit.',
  },
  {
    title: 'Jalan tanpa internet',
    body: 'Pasang ke layar utama. Kalkulator dan datanya tersimpan di perangkatmu, jadi tetap bisa dipakai di tempat yang sinyalnya jelek.',
  },
  {
    title: 'Ajak teman lewat link',
    body: 'Teman gabung tanpa daftar. Daftar peserta dan hasil putaran muncul langsung di semua HP.',
  },
];

export function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl px-5 py-24 lg:py-32">
      <h2 className="max-w-[20ch] text-balance text-[clamp(1.9rem,3.8vw,2.8rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
        Dibuat untuk urusan setelah pesan makanan.
      </h2>
      <dl className="mt-12 border-b border-line">
        {ROWS.map((row) => (
          <div key={row.title} className="grid gap-x-12 gap-y-2 border-t border-line py-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <dt className="text-xl font-bold tracking-tight">{row.title}</dt>
            <dd className="max-w-[62ch] text-muted">{row.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
