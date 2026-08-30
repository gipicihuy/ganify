import { error } from '@sveltejs/kit';
import { getUserById } from '$lib/server/db.js';

/**
 * Server-side-only admin authorization.
 *
 * Identity model reused from the rest of the app: `event.locals.uid` is the
 * `ganify_uid` cookie value, which `reconcileGuestHandle` in hooks.server.js
 * already keeps in sync with the merged Google account row in `users`
 * (see linkGoogleAccount in db.js). So the current admin candidate is just
 * `users` row `WHERE id = locals.uid`.
 *
 * `ADMIN_EMAIL` is read from `platform.env` (a Cloudflare secret/var) on
 * every call — it is never imported into client code and never serialized
 * into any load function's returned data.
 */
export async function getAdminUser(event) {
  const db = event.platform?.env?.DB;
  const adminEmail = event.platform?.env?.ADMIN_EMAIL;
  if (!db || !adminEmail) return null;

  const user = await getUserById(db, event.locals.uid);
  if (!user) return null;

  // Must be a real Google-linked account (not a guest), not banned, and the
  // verified Google email must match ADMIN_EMAIL exactly (case-sensitive —
  // Google emails are returned normalized/lowercased already).
  if (user.is_guest) return null;
  if (user.is_banned) return null;
  if (!user.email || user.email !== adminEmail) return null;

  return user;
}

/**
 * Use at the top of every /control page's +page.server.js load() and every
 * /api/admin/* endpoint. Throws SvelteKit's error(403) — correctly produces
 * a JSON {message} body with status 403 for API/fetch requests, and the
 * app's +error.svelte boundary for page loads.
 */
export async function requireAdmin(event) {
  const admin = await getAdminUser(event);
  if (!admin) {
    throw error(403, 'forbidden');
  }
  return admin;
}
