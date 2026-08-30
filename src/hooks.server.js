import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { sequence } from '@sveltejs/kit/hooks';
import { ensureUser, linkGoogleAccount, getUserById } from '$lib/server/db.js';
import { GUEST_COOKIE, guestCookieOptions } from '$lib/server/guestCookie.js';
import { getClientIp, notifyGoogleLogin, runBackground } from '$lib/server/activityMonitor.js';
import { guardApiRequest, ACCOUNT_API_PREFIXES } from '$lib/server/apiGuard.js';
import { getMaintenanceMode } from '$lib/server/adminDb.js';

// Paths that must always stay reachable, even during maintenance mode and
// even for banned users, so that: (a) the admin can still sign in and reach
// /control while the site is "down", and (b) auth/session plumbing itself
// never gets locked out by the checks it needs to run.
const ALWAYS_ALLOWED_PREFIXES = ['/control', '/api/admin', '/auth', '/login', '/logout', '/maintenance'];

function isAlwaysAllowed(pathname) {
  return ALWAYS_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const apiGuardHandle = async ({ event, resolve }) => {
  const blocked = await guardApiRequest(event);
  if (blocked) return blocked;
  return resolve(event);
};

const initGuestHandle = async ({ event, resolve }) => {
  let uid = event.cookies.get(GUEST_COOKIE);
  if (!uid) {
    uid = crypto.randomUUID();
    event.cookies.set(GUEST_COOKIE, uid, guestCookieOptions());
  }
  event.locals.uid = uid;
  return resolve(event);
};

const { handle: authHandle } = SvelteKitAuth(async (event) => {
  const env = event.platform?.env ?? {};
  const db = env.DB;

  return {
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      })
    ],
    secret: env.AUTH_SECRET,
    trustHost: true,
    callbacks: {
      async signIn({ user, account }) {
        if (!db || account?.provider !== 'google' || !account.providerAccountId) return true;
        try {
          const finalId = await linkGoogleAccount(db, event.locals.uid, account.providerAccountId, user);
          event.locals.ganifyLinkedUid = finalId;
          const ip = getClientIp(event.request, event);
          runBackground(
            event.platform,
            notifyGoogleLogin(event.platform, {
              name: user?.name,
              email: user?.email,
              avatarUrl: user?.image,
              ip
            })
          );
        } catch (err) {
          console.error('linkGoogleAccount failed', err);
        }
        return true;
      },
      async jwt({ token }) {
        if (event.locals.ganifyLinkedUid) {
          token.ganifyUid = event.locals.ganifyLinkedUid;
        }
        return token;
      },
      async session({ session, token }) {
        if (token?.ganifyUid) session.ganifyUid = token.ganifyUid;
        return session;
      }
    }
  };
});

const reconcileGuestHandle = async ({ event, resolve }) => {
  const db = event.platform?.env?.DB;
  if (db) {
    try {
      const session = await event.locals.auth?.();
      const targetUid = session?.ganifyUid;
      if (targetUid && targetUid !== event.locals.uid) {
        event.cookies.set(GUEST_COOKIE, targetUid, guestCookieOptions());
        event.locals.uid = targetUid;
      }
      await ensureUser(db, event.locals.uid);
    } catch (err) {
      console.error('reconcileGuestHandle failed', err);
    }
  }
  return resolve(event);
};

// Runs after the session/uid are fully reconciled, so `event.locals.uid`
// reliably points at the merged account row (if any) for this request.
const banAndMaintenanceHandle = async ({ event, resolve }) => {
  const db = event.platform?.env?.DB;
  const path = event.url.pathname;
  if (!db) return resolve(event);

  if (isAlwaysAllowed(path)) return resolve(event);

  try {
    const user = await getUserById(db, event.locals.uid);
    const adminEmail = event.platform?.env?.ADMIN_EMAIL;
    const isAdmin = !!user && !user.is_guest && !user.is_banned && !!adminEmail && user.email === adminEmail;

    // Banned users are rejected from account-scoped actions (liked songs,
    // history, playlists, profile edits, etc.) server-side, not just hidden
    // in the UI. Browsing (home/search/stream) is left alone.
    if (user?.is_banned && path.startsWith('/api/') && ACCOUNT_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return new Response(JSON.stringify({ error: 'account_banned' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!isAdmin) {
      const maintenance = await getMaintenanceMode(db);
      if (maintenance.enabled) {
        if (path.startsWith('/api/')) {
          return new Response(JSON.stringify({ error: 'maintenance', message: maintenance.message || null }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return new Response(null, { status: 302, headers: { location: '/maintenance' } });
        }
      }
    }
  } catch (err) {
    console.error('banAndMaintenanceHandle failed', err);
  }

  return resolve(event);
};

export const handle = sequence(
  apiGuardHandle,
  initGuestHandle,
  authHandle,
  reconcileGuestHandle,
  banAndMaintenanceHandle
);
