import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { listFeatureFlags, setFeatureFlag } from '$lib/server/adminDb.js';

export async function GET(event) {
  await requireAdmin(event);
  const db = event.platform.env.DB;
  const flags = await listFeatureFlags(db);
  return json({ flags });
}

export async function POST(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const body = await event.request.json().catch(() => ({}));
  if (!body.key) throw error(400, 'key is required');
  await setFeatureFlag(db, body.key, !!body.enabled, admin.email);
  return json({ ok: true });
}
