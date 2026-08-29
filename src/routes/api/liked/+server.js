import { json } from '@sveltejs/kit';
import { listLikedSongs, toggleLikedSong } from '$lib/server/db.js';

export async function GET({ locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ list: [] });
  const list = await listLikedSongs(db, locals.uid);
  return json({ list });
}

export async function POST({ request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ liked: false });
  const track = await request.json();
  if (!track?.videoId) return json({ error: 'videoId required' }, { status: 400 });
  const result = await toggleLikedSong(db, locals.uid, track);
  const list = await listLikedSongs(db, locals.uid);
  return json({ ...result, list });
}
