import { json, error } from '@sveltejs/kit';
import { markAnnouncementRead, markAnnouncementsReadBatch } from '$lib/server/adminDb.js';

export async function POST({ request, platform, locals }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: true });
  const body = await request.json().catch(() => ({}));

  if (Array.isArray(body.ids)) {
    if (!body.ids.length) return json({ ok: true });
    await markAnnouncementsReadBatch(db, locals.uid, body.ids);
    return json({ ok: true });
  }

  if (!body.id) throw error(400, 'id or ids is required');
  await markAnnouncementRead(db, locals.uid, body.id);
  return json({ ok: true });
}
