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
    return new Response(
      JSON.stringify({ error: 'no id' }),
      { status: 400 }
    );
  }

  try {
    const result = await resolveAudioSource(id);

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'failed' }),
        { status: 500 }
      );
    }

    runBackground(platform, notifyEvent(platform, 'song', {
      ip,
      endpoint: 'GET /api/stream',
      detail: { title: title || id, artist: artist || '-' }
    }));

    return new Response(
      JSON.stringify({
        url: result.url,
        source: result.source
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (e) {
    console.error(
      `[stream] unexpected error for id=${id}:`,
      e.message
    );

    return new Response(
      JSON.stringify({
        error: e.message
      }),
      {
        status: 500
      }
    );
  }
}
