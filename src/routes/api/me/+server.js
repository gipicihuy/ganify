import { json } from '@sveltejs/kit';
import { getUserById, getBindPromptState, dismissBindPrompt } from '$lib/server/db.js';

export async function GET({ locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ isGuest: true, shouldPrompt: false });
  const user = await getUserById(db, locals.uid);
  const prompt = await getBindPromptState(db, locals.uid);
  return json({
    isGuest: !user || !!user.is_guest,
    name: user?.name || null,
    email: user?.email || null,
    avatarUrl: user?.avatar_url || null,
    shouldPrompt: prompt.shouldPrompt,
    promptReason: prompt.reason || null
  });
}

export async function POST({ request, locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const body = await request.json().catch(() => ({}));
  if (body.action === 'dismiss_bind_prompt') {
    await dismissBindPrompt(db, locals.uid);
  }
  return json({ ok: true });
}
