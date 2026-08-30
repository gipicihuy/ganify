import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { getMaintenanceMode, setMaintenanceMode, logAdminAction } from '$lib/server/adminDb.js';

export async function GET(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const state = await getMaintenanceMode(db);
  return json(state);
}

export async function POST(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const body = await event.request.json().catch(() => ({}));
  await setMaintenanceMode(db, !!body.enabled, body.message, admin.email);
  await logAdminAction(db, admin.email, body.enabled ? 'maintenance_on' : 'maintenance_off', null, body.message || null);
  const state = await getMaintenanceMode(db);
  return json(state);
}
