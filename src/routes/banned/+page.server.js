import { getUserById } from '$lib/server/db.js';

export async function load({ locals, platform }) {
  const db = platform?.env?.DB;
  if (!db) return { banned: false };

  const user = await getUserById(db, locals.uid);
  if (!user?.is_banned) return { banned: false };

  return {
    banned: true,
    reason: user.banned_reason || null,
    bannedAt: user.banned_at || null
  };
}
