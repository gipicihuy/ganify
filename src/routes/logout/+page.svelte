<script>
  import { onMount } from 'svelte';
  import { signOut } from '@auth/sveltekit/client';

  onMount(async () => {
    try {
      await signOut({ redirect: false });
      await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_out' })
      });
    } finally {
      location.href = '/';
    }
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
