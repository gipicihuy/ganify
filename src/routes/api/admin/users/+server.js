import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { listUsers } from '$lib/server/adminDb.js';

export async function GET(event) {
  await requireAdmin(event);
  const db = event.platform.env.DB;
  const url = event.url;
  const search = url.searchParams.get('q') || '';
  const limit = Math.min(100, Number(url.searchParams.get('limit')) || 50);
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const result = await listUsers(db, { search, limit, offset });
  return json(result);
}
