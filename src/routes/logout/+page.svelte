<script>
  import { onMount } from 'svelte';
  import { signOut } from '@auth/sveltekit/client';

  onMount(async () => {
    // Reset app-level identity first: this is what actually makes /api/me
    // report isGuest again. It must not be skipped even if signOut() below
    // throws or hangs, otherwise the user still looks "logged in" after
    // clicking Log Out.
    try {
      await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_out' })
      });
    } catch (err) {
      console.error('logout: failed to reset app identity', err);
    }

    // Clear the NextAuth session separately. Previously this was awaited
    // with no try/catch before the fetch above, so any error here (or a
    // slow/failed CSRF round-trip) aborted the whole flow and left the old
    // ganify_uid cookie (and therefore the logged-in state) untouched.
    try {
      await signOut({ redirect: false });
    } catch (err) {
      console.error('logout: signOut() failed', err);
    }

    location.href = '/';
  });
</script>

<div style="min-height:60vh;display:flex;align-items:center;justify-content:center">
  <div class="auth-redirect-spin"></div>
</div>

<style>
  .auth-redirect-spin {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid rgba(255,255,255,.15);
    border-top-color: #FFFFFF;
    animation: _authRedirectSpin .7s linear infinite;
  }

  @keyframes _authRedirectSpin {
    to { transform: rotate(360deg); }
  }
</style>
