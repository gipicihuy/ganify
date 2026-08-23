import { getClientIp, isBlocked } from '$lib/server/activityMonitor.js';

const MUSIC_BASE = 'https://music.youtube.com';
const MUSIC_API = MUSIC_BASE + '/youtubei/v1';
const MUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CLIENT_VERSION = '1.20260804.16.00';
const MUSIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

async function musicPost(endpoint, body) {
  const payload = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: MUSIC_CLIENT_VERSION,
        hl: 'en',
        gl: 'US',
        userAgent: MUSIC_USER_AGENT
      }
    },
    ...body
  };
  const res = await fetch(`${MUSIC_API}/${endpoint}?key=${MUSIC_API_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': MUSIC_USER_AGENT,
      'X-Youtube-Client-Name': '67',
      'X-Youtube-Client-Version': MUSIC_CLIENT_VERSION,
      Origin: MUSIC_BASE,
      Referer: MUSIC_BASE + '/'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Music request failed (${res.status})`);
  return res.json();
}

function runsToText(runs) {
  return (runs || []).map((r) => r.text || '').join('');
}

// Channel auto-generated untuk artis di YouTube ("<Nama Artis> - Topic") ikut
// terbawa di beberapa field YT Music. Untuk tampilan di Ganify kita mau nama
// artis polos saja, jadi suffix ini dibuang.
function stripTopic(name) {
  return (name || '').replace(/\s*-\s*topic\s*$/i, '').trim();
}

function toHDThumbnail(thumbs, videoId) {
  const url = thumbs?.length ? thumbs[thumbs.length - 1].url : '';
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url;
}

async function fetchTrackMeta(videoId) {
  const json = await musicPost('next', { videoId, isAudioOnly: true });
  const queue =
    json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
      ?.content?.playlistPanelRenderer;

  const track =
    queue?.contents?.find((c) => c.playlistPanelVideoRenderer?.videoId === videoId)
      ?.playlistPanelVideoRenderer ||
    queue?.contents?.find((c) => c.playlistPanelVideoRenderer?.selected)
      ?.playlistPanelVideoRenderer ||
    queue?.contents?.[0]?.playlistPanelVideoRenderer;

  if (!track) return null;

  const title = runsToText(track?.title?.runs).replace(/\s*\([^)]*\)\s*$/g, '');
  if (!title) return null;

  const bylineRuns = track?.shortBylineText?.runs || [];
  let artist = '';
  let artistId = '';
  for (const run of bylineRuns) {
    const text = run.text || '';
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (browseId.startsWith('UC') && !artist) { artist = text; artistId = browseId; }
  }
  if (!artist) artist = runsToText(bylineRuns);
  artist = stripTopic(artist);

  const thumbnail = toHDThumbnail(track?.thumbnail?.thumbnails, videoId);
  const duration = track?.lengthText?.simpleText || runsToText(track?.lengthText?.runs) || '';

  return {
    videoId,
    title,
    thumbnail,
    duration,
    author: artist,
    artist,
    artistId
  };
}

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
    const result = await fetchTrackMeta(id);
    if (!result) {
      return new Response(JSON.stringify({ status: false, error: 'not found' }), { status: 404 });
    }
    return new Response(JSON.stringify({ status: true, result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error(`[song] failed for id=${id}:`, e.message);
    return new Response(JSON.stringify({ status: false, error: e.message }), { status: 500 });
  }
}
