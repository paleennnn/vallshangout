# VallsHangout

Spin wheel pilih tempat, voting, dan **patungan yang adil** (service & tax dibagi sesuai pesanan).
Next.js 16 · Supabase · PWA (bisa di-install, kalkulator jalan offline, Web Push) · gratisan.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local   # isi sesuai langkah di bawah
npm run dev                  # http://localhost:3000
npm test                     # 44 tes (engine + UI kalkulator)
```

Tanpa `.env.local` pun aplikasi jalan: **kalkulator `/calculator` tidak butuh Supabase**.
Fitur room (`/new`, `/h/<kode>`) menampilkan pesan "Supabase belum dikonfigurasi".

## 1. Supabase

1. Buat project baru di supabase.com.
2. SQL Editor → jalankan **berurutan**: `supabase/migrations/0001_init.sql`, lalu `0002_push_rpc.sql`.
3. Authentication → Sign In / Providers → aktifkan **Allow anonymous sign-ins**.
4. (Disarankan) Authentication → Attack Protection → aktifkan **CAPTCHA (Turnstile)**, lalu isi
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Tanpa CAPTCHA, siapa pun bisa membuat akun anonim sebanyak-banyaknya.
5. Project Settings → API → salin URL, publishable (atau anon) key, dan secret key ke `.env.local`.

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

Import repo, isi semua variabel dari `.env.example` di Project Settings → Environment Variables
(`SUPABASE_SECRET_KEY` dan `VAPID_PRIVATE_KEY` jangan pakai awalan `NEXT_PUBLIC_`), lalu deploy.
HTTPS wajib untuk service worker & push (Vercel sudah menyediakannya).

## Menguji PWA

Service worker **mati di `npm run dev`**. Uji di build produksi:

```bash
npm run build && npm start
```

Chrome DevTools → Application → *Service Workers* / *Manifest* → centang **Offline**, muat ulang
`/calculator`. Jalankan juga Lighthouse (kategori PWA).

Catatan iOS: instal lewat Safari → Bagikan → *Tambahkan ke Layar Utama*. Notifikasi push di iOS
hanya bekerja untuk aplikasi yang sudah ter-install (iOS 16.4+), dan sesi login anonim di versi
ter-install biasanya terpisah dari Safari — dorong pengguna menautkan akun sebelum instal.

## Struktur

```
src/app/
  page.tsx · calculator/ · new/ · h/[code]/   halaman
  sw.ts                                        service worker (precache + Web Push)
  serwist/[path]/route.ts                      menghasilkan /serwist/sw.js saat build
  manifest.ts · ~offline/                      manifest & halaman fallback offline
  api/push/send/route.ts                       kirim Web Push (server)
src/components/   SupabaseProvider (login anonim lazy) · Room · PushToggle · InstallPrompt · calculator/
src/lib/engine/   split.ts · settle.ts · spin.ts (+ tes)   ← logika uang, tanpa dependensi
src/lib/supabase/ klien & tipe
supabase/migrations/  0001_init.sql · 0002_push_rpc.sql
```

## Catatan

- `npm audit` melaporkan temuan pada dependensi **build** Serwist (zod, glob, minimatch). Dipakai saat
  build untuk menghasilkan service worker, bukan di runtime aplikasi; pantau pembaruan Serwist.
- Turnstile dan alur Realtime/Push dengan Supabase asli belum diuji end-to-end di lingkungan pengembangan
  ini (tidak ada project Supabase atau browser). Yang sudah diuji: engine, skema SQL + RLS, UI kalkulator
  (jsdom), build produksi, isi service worker/manifest.
