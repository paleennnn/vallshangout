# VallsHangout

Spin wheel pilih tempat, voting, dan **patungan yang adil** (service & tax dibagi sesuai pesanan).
Next.js 16, Supabase, PWA (bisa di-install, kalkulator jalan offline, Web Push), gratis.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local   # isi sesuai langkah di bawah
npm run dev                  # http://localhost:3000
npm test                     # 105 tes (engine, landing, kalkulator, roda, tempat, bottom nav, hub, footer)
```

Tanpa `.env.local` pun aplikasi jalan: **kalkulator `/calculator` tidak butuh Supabase**.
Fitur room (`/new`, `/h/<kode>`) menampilkan pesan "Supabase belum dikonfigurasi".

## 1. Supabase

1. Buat project baru di supabase.com.
2. SQL Editor > jalankan **berurutan**: `supabase/migrations/0001_init.sql`, lalu `0002_push_rpc.sql`.
3. Authentication > Sign In / Providers > aktifkan **Allow anonymous sign-ins**.
4. (Disarankan) Authentication > Attack Protection > aktifkan **CAPTCHA (Turnstile)**, lalu isi
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Tanpa CAPTCHA, siapa pun bisa membuat akun anonim sebanyak-banyaknya.
5. Project Settings > API > salin URL, publishable (atau anon) key, dan secret key ke `.env.local`.

> Project Supabase gratis di-pause setelah sekitar seminggu tanpa aktivitas. Siapkan ping terjadwal
> (mis. GitHub Actions) atau buka aplikasinya berkala. Kalkulator tetap jalan karena tidak memakai database.

## 2. Web Push

```bash
npm run vapid     # hasilnya: Public Key & Private Key
```

Isi `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:…), dan
`SUPABASE_SECRET_KEY` (server-only!). Mengirim notifikasi:

```ts
await fetch('/api/push/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({ hangoutId, title: 'Hasil spin', body: 'Malam ini ke Cafe A!', url: `/h/${code}` }),
});
```

Pengirim harus anggota hangout; penerima = semua peserta ber-akun lain yang mengaktifkan notifikasi.
**TODO sebelum publik:** batasi frekuensi kirim per hangout.

## 3. Deploy (Vercel)

Import repo, isi semua variabel dari `.env.example` di Project Settings > Environment Variables
(`SUPABASE_SECRET_KEY` dan `VAPID_PRIVATE_KEY` jangan pakai awalan `NEXT_PUBLIC_`), lalu deploy.
HTTPS wajib untuk service worker & push (Vercel sudah menyediakannya).

## Menguji PWA

Service worker **mati di `npm run dev`**. Uji di build produksi:

```bash
npm run build && npm start
```

Chrome DevTools > Application > *Service Workers* / *Manifest* > centang **Offline**, muat ulang
`/calculator`. Jalankan juga Lighthouse (kategori PWA).

Catatan iOS: instal lewat Safari > Bagikan > *Tambahkan ke Layar Utama*. Notifikasi push di iOS
hanya bekerja untuk aplikasi yang sudah ter-install (iOS 16.4+), dan sesi login anonim di versi
ter-install biasanya terpisah dari Safari, jadi dorong pengguna menautkan akun sebelum instal.

## Desain

Arah visual: Warm & Social (krem `#FFF7ED`, charcoal `#292524`, oranye `#F97316`), font Plus Jakarta
Sans (self-host di `public/fonts`, lisensi SIL OFL). Token ada di `src/app/globals.css` (`@theme`).

- Oranye hanya untuk aksi dan pilihan aktif. Teks di atas oranye selalu charcoal (kontras 5,4:1).
- Ikon memakai `lucide-react`. Tidak memakai emoji. Kolom `icon` di database menyimpan nama ikon lucide.
- Animasi landing page ada di `src/components/landing`; mengikuti `prefers-reduced-motion`
  (versi statis tanpa animasi scroll).

## Navigasi dan halaman

- Mobile: bottom nav mengambang (`src/components/BottomNav.tsx`) dengan 4 tujuan: Beranda, Kalkulator,
  Roda, Tempat, Hangout. Item aktif berupa lingkaran krem yang bergeser. Bar ini bersembunyi saat mengetik
  (keyboard layar) dan tidak tampil di layar `md` ke atas; di sana perpindahan halaman lewat header
  (`SiteHeader.tsx`). Daftar tujuan ada di satu tempat: `src/components/nav-items.ts`.
- `/spin`: roda putar mandiri dengan pilihan kustom, riwayat, dan "coret dari roda". Tersimpan di
  perangkat, jalan offline. Undian memakai `crypto.getRandomValues` (`src/lib/engine/random.ts`).
  Undian resmi di room tetap diundi di server lewat `do_spin`.
- `/places`: daftar tempat langganan dengan kategori, persen service dan pajak, sewa per jam, tautan Maps,
  dan catatan kunjungan. Tersimpan di perangkat (`vh:places:v1`), jalan offline. Dari kartu tempat,
  "Hitung patungan di sini" membuka kalkulator dengan nama acara, service, dan pajak terisi otomatis
  (`/calculator?place=ID`); kalkulator juga punya pemilih tempat. "Putar roda" memilih dari daftar yang
  sedang tampil: lebar irisan sebanding bobot (tempat yang lama tidak dikunjungi irisannya lebih besar),
  jadi yang tampak di roda memang yang menentukan peluangnya.
- `/hangouts`: daftar hangout milikmu, buat baru, dan gabung dengan kode.
- Responsif: halaman sudah dicek tanpa overflow horizontal di lebar 320, 360, dan 390px. Kolom isian
  memakai font 16px di mobile supaya iOS tidak memperbesar layar saat fokus.

## Struktur

```
src/app/
  page.tsx, calculator/, new/, h/[code]/   halaman
  sw.ts                                        service worker (precache + Web Push)
  serwist/[path]/route.ts                      menghasilkan /serwist/sw.js saat build
  manifest.ts, ~offline/                      manifest & halaman fallback offline
  api/push/send/route.ts                       kirim Web Push (server)
src/components/   SupabaseProvider (login anonim lazy), Room, PushToggle, InstallPrompt, calculator/
src/lib/engine/   split.ts, settle.ts, spin.ts (+ tes)   (logika uang, tanpa dependensi)
src/lib/supabase/ klien & tipe
supabase/migrations/  0001_init.sql, 0002_push_rpc.sql
```

## Catatan

- `npm audit` melaporkan temuan pada dependensi **build** Serwist (zod, glob, minimatch). Dipakai saat
  build untuk menghasilkan service worker, bukan di runtime aplikasi; pantau pembaruan Serwist.
- Turnstile dan alur Realtime/Push dengan Supabase asli belum diuji end-to-end di lingkungan pengembangan
  ini (tidak ada project Supabase atau browser). Yang sudah diuji: engine, skema SQL + RLS, UI kalkulator
  (jsdom), build produksi, isi service worker/manifest.
