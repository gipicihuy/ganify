import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { sequence } from '@sveltejs/kit/hooks';
import { ensureUser, linkGoogleAccount } from '$lib/server/db.js';
import { GUEST_COOKIE, guestCookieOptions } from '$lib/server/guestCookie.js';
import { getClientIp, notifyGoogleLogin, runBackground } from '$lib/server/activityMonitor.js';

const guestHandle = async ({ event, resolve }) => {
  let uid = event.cookies.get(GUEST_COOKIE);
  if (!uid) {
    uid = crypto.randomUUID();
    event.cookies.set(GUEST_COOKIE, uid, guestCookieOptions());
  }
  event.locals.uid = uid;
  const db = event.platform?.env?.DB;
  if (db) {
    try {
      await ensureUser(db, uid);
    } catch (err) {
      console.error('ensureUser failed', err);
    }
  }
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
          if (finalId !== event.locals.uid) {
            event.locals.uid = finalId;
            event.cookies.set(GUEST_COOKIE, finalId, guestCookieOptions());
          }
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
      async session({ session }) {
        session.uid = event.locals.uid;
        return session;
      }
    }
  };
});

export const handle = sequence(guestHandle, authHandle);
