import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { getOverviewStats, getMaintenanceMode } from '$lib/server/adminDb.js';

export async function GET(event) {
  await requireAdmin(event);
  const db = event.platform.env.DB;
  const [stats, maintenance] = await Promise.all([getOverviewStats(db), getMaintenanceMode(db)]);
  return json({ stats, maintenance });
}
