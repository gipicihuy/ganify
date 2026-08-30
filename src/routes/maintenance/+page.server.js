import { getMaintenanceMode } from '$lib/server/adminDb.js';

export async function load({ platform }) {
  const db = platform?.env?.DB;
  if (!db) return { enabled: false, message: '' };
  const state = await getMaintenanceMode(db);
  return { enabled: state.enabled, message: state.message || '' };
}
