import { getClientIp, isBlocked } from '$lib/server/activityMonitor.js';
import { listLikedSongs, listHistory } from '$lib/server/db.js';

const MUSIC_BASE = 'https://music.youtube.com';
const MUSIC_API = MUSIC_BASE + '/youtubei/v1';
const MUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CLIENT_VERSION = '1.20260804.16.00';
const MUSIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const QUICK_PICKS_TARGET = 24;
const SEED_COUNT = 3;

async function musicPost(endpoint, body) {
  const payload = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: MUSIC_CLIENT_VERSION,
        hl: 'id',
        gl: 'ID',
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

function stripTopic(name) {
  return (name || '').replace(/\s*-\s*topic\s*$/i, '').trim();
}

function toHDThumbnail(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url || '';
}

function parseQueueTrack(track) {
  if (!track || !track.videoId) return null;
  const title = runsToText(track?.title?.runs).replace(/\s*\([^)]*\)\s*$/g, '');
  if (!title) return null;

  const bylineRuns = track?.shortBylineText?.runs || [];
  let artist = '', artistId = '';
  for (const run of bylineRuns) {
    const text = run.text || '';
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if ((browseId.startsWith('UC') || browseId.startsWith('MPLA')) && !artist) { artist = text; artistId = browseId; }
  }
  if (!artist) artist = (bylineRuns[0]?.text || '');
  artist = stripTopic(artist);

  const thumbnail = toHDThumbnail(
    (track?.thumbnail?.thumbnails || []).length
      ? track.thumbnail.thumbnails[track.thumbnail.thumbnails.length - 1].url
      : '',
    track.videoId
  );
  const duration = track?.lengthText?.simpleText || runsToText(track?.lengthText?.runs) || '';

  return { videoId: track.videoId, title, thumbnail, duration, author: artist, artist, artistId };
}

async function fetchRelatedForSeed(videoId) {
  try {
    const json = await musicPost('next', { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true });
    const panel = json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
      ?.content?.playlistPanelRenderer;
    return (panel?.contents || [])
      .map((c) => parseQueueTrack(c.playlistPanelVideoRenderer))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function trackFromRow(row) {
  if (!row?.videoId) return null;
  return {
    videoId: row.videoId,
    title: row.title || '',
    thumbnail: row.thumbnail || toHDThumbnail('', row.videoId),
    author: row.author || row.artist || '',
    artist: row.artist || row.author || '',
    artistId: row.artistId || ''
  };
}

export async function GET({ request, platform, locals }) {
  const ip = getClientIp(request);
  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ status: false, error: 'blocked' }), { status: 403 });
  }

  const db = platform?.env?.DB;
  if (!db) return new Response(JSON.stringify({ status: true, list: [] }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const [liked, history] = await Promise.all([
      listLikedSongs(db, locals.uid),
      listHistory(db, locals.uid)
    ]);

    const likedTracks = liked.map(trackFromRow).filter(Boolean);
    const historyTracks = history.map(trackFromRow).filter(Boolean);

    const seeds = [];
    const seenSeed = new Set();
    for (const t of [...historyTracks, ...likedTracks]) {
      if (seeds.length >= SEED_COUNT) break;
      if (seenSeed.has(t.videoId)) continue;
      seenSeed.add(t.videoId);
      seeds.push(t.videoId);
    }

    let relatedTracks = [];
    if (seeds.length) {
      const relatedLists = await Promise.all(seeds.map(fetchRelatedForSeed));
      relatedTracks = relatedLists.flat().map(trackFromRow).filter(Boolean);
    }

    const seen = new Set();
    const combined = [];
    for (const t of [...historyTracks, ...likedTracks, ...relatedTracks]) {
      if (seen.has(t.videoId)) continue;
      seen.add(t.videoId);
      combined.push(t);
    }

    const list = shuffle(combined).slice(0, QUICK_PICKS_TARGET);

    return new Response(JSON.stringify({ status: true, list }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[quick-picks] failed:', e.message);
    return new Response(JSON.stringify({ status: false, error: e.message, list: [] }), { status: 500 });
  }
}
