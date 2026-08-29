import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { sequence } from '@sveltejs/kit/hooks';
import { ensureUser, linkGoogleAccount } from '$lib/server/db.js';
import { GUEST_COOKIE, guestCookieOptions } from '$lib/server/guestCookie.js';
import { getClientIp, notifyGoogleLogin, runBackground } from '$lib/server/activityMonitor.js';
import { guardApiRequest } from '$lib/server/apiGuard.js';

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

export const handle = sequence(apiGuardHandle, initGuestHandle, authHandle, reconcileGuestHandle);
