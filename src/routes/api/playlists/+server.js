import { json } from '@sveltejs/kit';
import { listPlaylists, createPlaylist } from '$lib/server/db.js';

export async function GET({ locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ list: [] });
  const list = await listPlaylists(db, locals.uid);
  return json({ list });
}

export async function POST({ request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'no database' }, { status: 500 });
  const { name } = await request.json();
  if (!name) return json({ error: 'name required' }, { status: 400 });
  const playlist = await createPlaylist(db, locals.uid, name);
  return json({ playlist });
}
