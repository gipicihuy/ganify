import { getClientIp, isBlocked } from '$lib/server/activityMonitor.js';
import { fetchTrackMetaLight } from '$lib/server/songMeta.js';

// Endpoint ringan khusus buat preview share (bottom sheet "Seseorang
// membagikan lagu ini kepadamu" di Home). Sengaja dipisah dari /api/song
// (yang dipakai player & "Lagu Serupa") karena itu ngambil queue up-next
// lengkap - jauh lebih berat dari yang dibutuhin cuma buat nampilin
// cover + judul + artist di bottom sheet.
export async function GET({ url, request, platform }) {
  const id = url.searchParams.get('id');
  const ip = getClientIp(request);

  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ status: false, error: 'blocked' }), { status: 403 });
  }

  if (!id) {
    return new Response(JSON.stringify({ status: false, error: 'no id' }), { status: 400 });
  }

  try {
    const result = await fetchTrackMetaLight(id);
    if (!result) {
      return new Response(JSON.stringify({ status: false, error: 'not found' }), { status: 404 });
    }
    return new Response(JSON.stringify({ status: true, result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error(`[song/preview] failed for id=${id}:`, e.message);
    return new Response(JSON.stringify({ status: false, error: e.message }), { status: 500 });
  }
}
