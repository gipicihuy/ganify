import { json } from '@sveltejs/kit';
import { listHistory, addHistory, removeHistory } from '$lib/server/db.js';

export async function GET({ locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ list: [] });
  const list = await listHistory(db, locals.uid);
  return json({ list });
}

export async function POST({ request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const track = await request.json();
  if (!track?.videoId) return json({ error: 'videoId required' }, { status: 400 });
  await addHistory(db, locals.uid, track);
  return json({ ok: true });
}

export async function DELETE({ request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const { videoId } = await request.json();
  if (!videoId) return json({ error: 'videoId required' }, { status: 400 });
  await removeHistory(db, locals.uid, videoId);
  return json({ ok: true });
}
