<script>
  import { onMount } from 'svelte';
  import { signIn } from '@auth/sveltekit/client';

  let _visible = false;
  let _reason = null;

  onMount(async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      _visible = !!data.shouldPrompt;
      _reason = data.promptReason || null;
    } catch {
      _visible = false;
    }
  });

  function _bind() {
    signIn('google');
  }

  async function _dismiss() {
    _visible = false;
    try {
      await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_bind_prompt' })
      });
    } catch {}
  }
</script>

{#if _visible}
  <div class="bind-prompt" role="alert">
    <div class="bind-prompt-icon">
      <svg width="20" height="20" fill="#FFFFFF" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    </div>
    <div class="bind-prompt-body">
      <p class="bind-prompt-title">Jangan sampai hilang</p>
      <p class="bind-prompt-text">
        {#if _reason === 'activity'}
          Simpan lagu, playlist, dan riwayatmu dengan akun Google.
        {:else}
          Sudah beberapa hari dipakai — hubungkan ke Google biar aman.
        {/if}
      </p>
      <div class="bind-prompt-actions">
        <button class="bind-prompt-btn-primary" on:click={_bind}>Masuk dengan Google</button>
        <button class="bind-prompt-btn-secondary" on:click={_dismiss}>Nanti saja</button>
      </div>
    </div>
    <button class="bind-prompt-close" aria-label="Tutup" on:click={_dismiss}>
      <svg width="16" height="16" fill="rgba(245,245,245,.5)" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>
  </div>
{/if}

<style>
  .bind-prompt {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 12px;
    right: 12px;
    z-index: 120;
    max-width: 480px;
    margin: 0 auto;
    background: #1c1c1c;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 18px;
    padding: 14px 12px 14px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
    animation: _bindPromptIn .25s ease;
  }

  .bind-prompt-icon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255,255,255,.08);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .bind-prompt-body {
    flex: 1;
    min-width: 0;
  }

  .bind-prompt-title {
    font-size: .86rem;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0 0 4px;
  }

  .bind-prompt-text {
    font-size: .76rem;
    color: rgba(245,245,245,.55);
    margin: 0 0 10px;
    line-height: 1.4;
  }

  .bind-prompt-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .bind-prompt-btn-primary {
    padding: 8px 14px;
    border-radius: 10px;
    background: linear-gradient(135deg,#FFFFFF,#E6E6E6);
    border: none;
    cursor: pointer;
    font-family: 'Quicksand', sans-serif;
    font-size: .76rem;
    font-weight: 700;
    color: #141414;
  }

  .bind-prompt-btn-secondary {
    padding: 8px 14px;
    border-radius: 10px;
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.12);
    cursor: pointer;
    font-family: 'Quicksand', sans-serif;
    font-size: .76rem;
    font-weight: 700;
    color: rgba(245,245,245,.6);
  }

  .bind-prompt-close {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    flex-shrink: 0;
  }

  @keyframes _bindPromptIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
