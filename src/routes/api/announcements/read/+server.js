import { json, error } from '@sveltejs/kit';
import { markAnnouncementRead } from '$lib/server/adminDb.js';

export async function POST({ request, platform, locals }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: true });
  const body = await request.json().catch(() => ({}));
  if (!body.id) throw error(400, 'id is required');
  await markAnnouncementRead(db, locals.uid, body.id);
  return json({ ok: true });
}
