import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { setUserBanned } from '$lib/server/adminDb.js';
import { getUserById } from '$lib/server/db.js';

export async function POST(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const { id } = event.params;

  const target = await getUserById(db, id);
  if (!target) throw error(404, 'user not found');
  if (target.email && admin.email && target.email === admin.email) {
    throw error(400, "can't ban yourself");
  }

  const body = await event.request.json().catch(() => ({}));
  const action = body.action; // 'ban' | 'unban'
  if (action !== 'ban' && action !== 'unban') throw error(400, 'invalid action');

  await setUserBanned(db, id, action === 'ban', body.reason, admin.email);
  return json({ ok: true });
}
