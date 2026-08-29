export const GUEST_COOKIE = 'ganify_uid';
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function guestCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: GUEST_COOKIE_MAX_AGE
  };
}
