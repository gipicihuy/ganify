import { json } from '@sveltejs/kit';
import { getUserById, getBindPromptState, dismissBindPrompt, clearLikedSongs, clearHistory, deleteAccountData, ensureUser } from '$lib/server/db.js';
import { GUEST_COOKIE, guestCookieOptions } from '$lib/server/guestCookie.js';

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

export async function POST({ request, locals, platform, cookies }) {
  const db = platform?.env?.DB;
  if (!db) return json({ ok: false });
  const body = await request.json().catch(() => ({}));
  if (body.action === 'dismiss_bind_prompt') {
    await dismissBindPrompt(db, locals.uid);
  } else if (body.action === 'clear_liked') {
    await clearLikedSongs(db, locals.uid);
  } else if (body.action === 'clear_history') {
    await clearHistory(db, locals.uid);
  } else if (body.action === 'delete_account') {
    await deleteAccountData(db, locals.uid);
    const newUid = crypto.randomUUID();
    cookies.set(GUEST_COOKIE, newUid, guestCookieOptions());
    await ensureUser(db, newUid);
    locals.uid = newUid;
  }
  return json({ ok: true });
}
