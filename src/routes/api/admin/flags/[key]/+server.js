import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { deleteFeatureFlag } from '$lib/server/adminDb.js';

export async function DELETE(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  await deleteFeatureFlag(db, event.params.key, admin.email);
  return json({ ok: true });
}
