import { json } from '@sveltejs/kit';
import { addTrackToPlaylist, removeTrackFromPlaylist } from '$lib/server/db.js';

export async function POST({ params, request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const track = await request.json();
  if (!track?.videoId) return json({ error: 'videoId required' }, { status: 400 });
  const added = await addTrackToPlaylist(db, locals.uid, params.id, track);
  return json({ added });
}

export async function DELETE({ params, request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const { videoId } = await request.json();
  if (!videoId) return json({ error: 'videoId required' }, { status: 400 });
  await removeTrackFromPlaylist(db, locals.uid, params.id, videoId);
  return json({ ok: true });
}
