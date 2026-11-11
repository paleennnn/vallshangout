import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { formatIDR } from '@/lib/engine/split';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = ['bill_created', 'bill_finalized', 'transfer_paid'] as const;
type Event = (typeof EVENTS)[number];

/** Maksimal notifikasi (kejadian) per hangout per menit, menahan penyalahgunaan oleh anggota. */
const MAX_EVENTS_PER_MINUTE = 10;

interface Participant {
  id: string;
  name: string;
  user_id: string | null;
}
interface Message {
  userId: string;
  title: string;
  body: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Kirim notifikasi push atas kejadian di room ke peserta (ber-akun) selain pengirim.
 *
 * Body: { hangoutId, event, refId }. Isi pesan TIDAK diterima dari klien: server membaca data
 * kejadiannya (tagihan atau transfer) dan menyusun teks sendiri, jadi anggota tidak bisa
 * mengirim teks sembarang ke peserta lain. Kejadian yang sama hanya dikirim sekali (tabel
 * push_events) dan frekuensinya dibatasi per hangout.
 *
 * Auth: header `Authorization: Bearer <access_token user>`; pengirim harus anggota hangout dan
 * data kejadian dibaca dengan token pengirim (RLS). Langganan push peserta lain dibaca dengan
 * secret key (server-only).
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!url || !publicKey || !secretKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'push belum dikonfigurasi di server' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let payload: { hangoutId?: unknown; event?: unknown; refId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON tidak valid' }, { status: 400 });
  }
  const { hangoutId, event, refId } = payload;
  if (typeof hangoutId !== 'string' || !UUID.test(hangoutId)) {
    return NextResponse.json({ error: 'hangoutId tidak valid' }, { status: 400 });
  }
  if (typeof event !== 'string' || !(EVENTS as readonly string[]).includes(event)) {
    return NextResponse.json({ error: 'event tidak dikenal' }, { status: 400 });
  }
  if (typeof refId !== 'string' || !UUID.test(refId)) {
    return NextResponse.json({ error: 'refId tidak valid' }, { status: 400 });
  }

  // 1) Siapa pengirim, dan apakah dia anggota hangout ini? (RLS memutuskan)
  const asUser = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const senderId = userData.user.id;

  const { data: hangout } = await asUser.from('hangouts').select('id,invite_code').eq('id', hangoutId).maybeSingle();
  if (!hangout) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const path = `/h/${hangout.invite_code as string}`;

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: peopleRaw } = await admin
    .from('hangout_participants')
    .select('id,name,user_id')
    .eq('hangout_id', hangoutId);
  const people = (peopleRaw ?? []) as Participant[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const others = people.filter((p): p is Participant & { user_id: string } => !!p.user_id && p.user_id !== senderId);

  // 2) Susun pesan dari data kejadian (dibaca dengan token pengirim, jadi RLS berlaku)
  const messages: Message[] = [];
  const kind = event as Event;

  if (kind === 'bill_created' || kind === 'bill_finalized') {
    const { data: bill } = await asUser
      .from('bills')
      .select('id,hangout_id,title,status,paid_by')
      .eq('id', refId)
      .maybeSingle();
    const wanted = kind === 'bill_created' ? 'draft' : 'final';
    if (!bill || bill.hangout_id !== hangoutId || bill.status !== wanted) {
      return NextResponse.json({ error: 'kejadian tidak ditemukan' }, { status: 404 });
    }
    const title = clip(String(bill.title), 60);

    if (kind === 'bill_created') {
      for (const p of others) {
        messages.push({ userId: p.user_id, title: `Tagihan baru: ${title}`, body: 'Tandai pesananmu sekarang.' });
      }
    } else {
      const { data: shares } = await admin.from('bill_shares').select('participant_id,total').eq('bill_id', refId);
      const totalOf = new Map(((shares ?? []) as { participant_id: string; total: number }[]).map((s) => [s.participant_id, Number(s.total)]));
      for (const p of others) {
        const mine = totalOf.get(p.id);
        if (mine !== undefined) {
          messages.push({ userId: p.user_id, title: `${title} sudah final`, body: `Bagianmu ${formatIDR(mine)}.` });
        } else if (p.id === bill.paid_by) {
          messages.push({ userId: p.user_id, title: `${title} sudah final`, body: 'Teman-temanmu akan transfer ke kamu.' });
        }
      }
    }
  } else {
    const { data: tr } = await asUser
      .from('transfers')
      .select('id,hangout_id,from_participant,to_participant,amount,status')
      .eq('id', refId)
      .maybeSingle();
    if (!tr || tr.hangout_id !== hangoutId || tr.status !== 'paid') {
      return NextResponse.json({ error: 'kejadian tidak ditemukan' }, { status: 404 });
    }
    const receiver = byId.get(tr.to_participant as string);
    const sender = byId.get(tr.from_participant as string);
    if (receiver?.user_id && receiver.user_id !== senderId) {
      messages.push({
        userId: receiver.user_id,
        title: `${clip(sender?.name ?? 'Seseorang', 40)} sudah transfer`,
        body: `${formatIDR(Number(tr.amount))} ke kamu. Buka room untuk konfirmasi.`,
      });
    }
  }

  // 3) Anti-ganda dan pembatasan frekuensi (satu kejadian hanya sekali; maks N per menit)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from('push_events')
    .select('ref_id', { count: 'exact', head: true })
    .eq('hangout_id', hangoutId)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_EVENTS_PER_MINUTE) {
    return NextResponse.json({ error: 'terlalu sering' }, { status: 429 });
  }
  const { error: claimErr } = await admin.from('push_events').insert({ event, ref_id: refId, hangout_id: hangoutId });
  if (claimErr) {
    if (claimErr.code === '23505') return NextResponse.json({ sent: 0, failed: 0, removed: 0, duplicate: true });
    return NextResponse.json({ error: 'gagal mencatat kejadian' }, { status: 500 });
  }

  if (messages.length === 0) return NextResponse.json({ sent: 0, failed: 0, removed: 0 });

  // 4) Kirim ke semua perangkat tiap penerima
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id,endpoint,p256dh,auth')
    .in('user_id', [...new Set(messages.map((m) => m.userId))]);

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', vapidPublic, vapidPrivate);

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all(
    ((subs ?? []) as { user_id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
      const m = messages.find((x) => x.userId === s.user_id);
      if (!m) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: path, tag: `${hangoutId}-${event}` }),
          { TTL: 3600 },
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint); // langganan sudah tidak berlaku
      }
    }),
  );

  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);
  return NextResponse.json({ sent, failed, removed: dead.length });
}
