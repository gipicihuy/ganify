import { getClientIp, isBlocked, notifyEvent, runBackground } from '$lib/server/activityMonitor.js';
import { resolveAudioSource } from '$lib/server/audioSource.js';

export async function GET({ url, request, platform }) {
  const id = url.searchParams.get('id');
  const title = url.searchParams.get('title') || '';
  const artist = url.searchParams.get('artist') || '';
  const ip = getClientIp(request);

  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ error: 'blocked' }), { status: 403 });
  }

  if (!id) {
    return new Response(JSON.stringify({ error: 'no id' }), { status: 400 });
  }

  try {
    const resolved = await resolveAudioSource(id);
    if (!resolved) {
      return new Response(JSON.stringify({ error: 'failed' }), { status: 500 });
    }

    // Hybrid WebView: langsung ke backend, jangan lewat frontend page dulu.
    // WebView Android akan intercept URL ini via DownloadListener / shouldOverrideUrlLoading
    // dan serahkan ke DownloadManager. Jadi set Content-Disposition agar langsung dikenali
    // sebagai file, bukan stream inline. Web normal tetap bisa fetch via JS (blob) karena
    // header ini tidak mengganggu fetch arrayBuffer.
    const audioRes = await fetch(resolved.url, {
      headers: request.headers.get('range') ? { Range: request.headers.get('range') } : undefined
    });
    if (!audioRes.ok || !audioRes.body) {
      return new Response(JSON.stringify({ error: 'fetch failed' }), { status: 502 });
    }

    runBackground(platform, notifyEvent(platform, 'download', {
      ip,
      endpoint: 'GET /api/download',
      detail: { title: title || id, artist: artist || '-' }
    }));

    const safeTitle = (title || id).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'audio';
    const safeArtist = (artist || 'Unknown').replace(/[\\/:*?"<>|]/g, '').trim();
    const filename = `${safeTitle} - ${safeArtist}.mp3`.replace(/"/g, '');

    const headers = new Headers();
    headers.set('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    // Teruskan header penting untuk streaming/download resume
    const cl = audioRes.headers.get('content-length');
    if (cl) headers.set('Content-Length', cl);
    const cr = audioRes.headers.get('content-range');
    if (cr) headers.set('Content-Range', cr);
    if (audioRes.headers.get('accept-ranges')) headers.set('Accept-Ranges', audioRes.headers.get('accept-ranges'));
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(audioRes.body, {
      status: audioRes.status === 206 ? 206 : 200,
      headers
    });
  } catch (e) {
    console.error(`[download] unexpected error for id=${id}:`, e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
