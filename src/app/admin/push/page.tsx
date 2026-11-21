import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminPush } from '@/components/admin/AdminPush';
import { SESSION_COOKIE, adminConfigured, verifySessionToken } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminPushPage() {
  if (!adminConfigured()) {
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-muted">Belum dikonfigurasi. Isi ADMIN_PASSWORD (minimal 12 karakter) di server.</p>
      </main>
    );
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token) ? <AdminPush /> : <AdminLogin />;
}
