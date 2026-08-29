import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';

export const { handle } = SvelteKitAuth(async (event) => {
  const env = event.platform?.env ?? {};

  return {
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      })
    ],
    secret: env.AUTH_SECRET,
    trustHost: true
  };
});
