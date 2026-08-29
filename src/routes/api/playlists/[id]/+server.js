import { json } from '@sveltejs/kit';
import { renamePlaylist, deletePlaylist } from '$lib/server/db.js';

export async function PATCH({ params, request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const { name } = await request.json();
  if (!name) return json({ error: 'name required' }, { status: 400 });
  await renamePlaylist(db, locals.uid, params.id, name);
  return json({ ok: true });
}

export async function DELETE({ params, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  await deletePlaylist(db, locals.uid, params.id);
  return json({ ok: true });
}
