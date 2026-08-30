import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { countStaleGuests, deleteStaleGuests } from '$lib/server/adminDb.js';

const DAY_MS = 86_400_000;
const MIN_DAYS = 7;

function parseDays(raw) {
  const days = Number(raw);
  if (!Number.isFinite(days) || days < MIN_DAYS) return null;
  return days;
}

export async function GET(event) {
  await requireAdmin(event);
  const db = event.platform.env.DB;
  const days = parseDays(event.url.searchParams.get('days'));
  if (days === null) throw error(400, `days must be a number >= ${MIN_DAYS}`);
  const count = await countStaleGuests(db, days * DAY_MS);
  return json({ count, days });
}

export async function POST(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const body = await event.request.json().catch(() => ({}));
  const days = parseDays(body.days);
  if (days === null) throw error(400, `days must be a number >= ${MIN_DAYS}`);
  const deleted = await deleteStaleGuests(db, days * DAY_MS, admin.email);
  return json({ deleted, days });
}
