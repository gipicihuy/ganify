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

    const audioRes = await fetch(resolved.url);
    if (!audioRes.ok || !audioRes.body) {
      return new Response(JSON.stringify({ error: 'fetch failed' }), { status: 502 });
    }

    runBackground(platform, notifyEvent(platform, 'download', {
      ip,
      endpoint: 'GET /api/download',
      detail: { title: title || id, artist: artist || '-' }
    }));

    return new Response(audioRes.body, {
      headers: {
        'Content-Type': audioRes.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    console.error(`[download] unexpected error for id=${id}:`, e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
