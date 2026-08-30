import { error } from '@sveltejs/kit';
import { getAdminUser } from '$lib/server/admin.js';

export async function load(event) {
  const admin = await getAdminUser(event);
  if (!admin) {
    throw error(403, 'Access denied');
  }
  // Only ever return the logged-in admin's own (already-known-to-them)
  // email/name — never ADMIN_EMAIL itself, which stays server-only.
  return { admin: { email: admin.email, name: admin.name, avatarUrl: admin.avatar_url } };
}
