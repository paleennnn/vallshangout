import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Endpoint yang sudah tidak berlaku (404/410) dan sebaiknya dihapus. */
  dead: string[];
}

/** Kunci VAPID lengkap? Bila tidak, push belum bisa dikirim. */
export function vapidConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Kirim satu payload ke banyak perangkat, dalam kelompok kecil paralel agar satu batch tidak
 * melewati batas waktu fungsi server. `urgency: low` supaya siaran tidak membangunkan perangkat.
 */
export async function sendWebPush(
  targets: PushTarget[],
  payload: { title: string; body: string; url: string; tag?: string },
  options: { concurrency?: number; ttl?: number } = {},
): Promise<PushResult> {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  const body = JSON.stringify(payload);
  const size = Math.max(1, options.concurrency ?? 25);
  const result: PushResult = { sent: 0, failed: 0, dead: [] };

  for (let i = 0; i < targets.length; i += size) {
    await Promise.all(
      targets.slice(i, i + size).map(async (t) => {
        try {
          await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, {
            TTL: options.ttl ?? 86400,
            urgency: 'low',
          });
          result.sent++;
        } catch (e) {
          result.failed++;
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) result.dead.push(t.endpoint);
        }
      }),
    );
  }
  return result;
}
