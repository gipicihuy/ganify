import { getClientIp, isBlocked } from '$lib/server/activityMonitor.js';

const MUSIC_BASE = 'https://music.youtube.com';
const MUSIC_API = MUSIC_BASE + '/youtubei/v1';
const MUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CLIENT_VERSION = '1.20260804.16.00';
const MUSIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SONGS_PARAMS = 'EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO';

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

// Endpoint search YT Music yang sama persis dipakai halaman /search, biar
// nama & id artis yang tampil di halaman lagu konsisten dengan yang tampil
// waktu diputar dari pencarian/beranda.
async function searchSongs(query) {
  const payload = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
    query,
    params: SONGS_PARAMS
  };
  const r = await fetch(`${MUSIC_BASE}/youtubei/v1/search?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': SEARCH_UA, Origin: MUSIC_BASE },
    body: JSON.stringify(payload)
  });
  return r.json();
}

function getRunsText(runs) {
  return Array.isArray(runs) ? runs.map((r) => r.text || '').join('') : '';
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

function toHDThumbnail(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return url || '';
}

function durationToColon(text) {
  if (!text) return '';
  const m = String(text).match(/(\d+)\s*(?:menit|min)\s*(?:(\d+)\s*(?:detik|det))?/i);
  if (m) return `${m[1]}:${(m[2] || '00').padStart(2, '0')}`;
  const m2 = String(text).match(/(\d+):(\d+)/);
  if (m2) return `${m2[1]}:${m2[2].padStart(2, '0')}`;
  return '';
}

// Cari baris lagu (dengan artist/artistId yang sudah diparse dengan benar,
// satu artis utama saja — bukan gabungan mentah semua artis+featuring) yang
// videoId-nya cocok persis dengan yang diminta.
function findSongRowByVideoId(data, videoId) {
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of sections) {
      const shelf = section?.musicShelfRenderer;
      const items = shelf?.contents || section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const r = item?.musicResponsiveListItemRenderer;
        if (!r) continue;
        const rowVideoId = r?.playlistItemData?.videoId || '';
        if (rowVideoId !== videoId) continue;

        const cols = r.flexColumns || [];
        const title = getRunsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
        const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        let artist = '', artistId = '', album = '';
        for (const run of subRuns) {
          const text = run.text || '';
          const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
          if (browseId.startsWith('UC') && !artist) { artist = text; artistId = browseId; }
          else if (browseId.startsWith('MPRE') && !album) { album = text; }
        }
        if (!artist) {
          const durationLike = /^\d+:\d{2}(:\d{2})?$/;
          const meaningfulRuns = subRuns.filter((run) => {
            const txt = (run.text || '').trim();
            return txt && txt !== '•' && txt !== '·' && txt !== '-';
          });
          for (let i = 0; i < meaningfulRuns.length; i++) {
            const txt = (meaningfulRuns[i].text || '').trim();
            if (i === 0) continue;
            if (durationLike.test(txt)) continue;
            if (album && txt === album) continue;
            artist = meaningfulRuns[i].text || '';
            break;
          }
        }

        const accLabel = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.accessibility?.accessibilityData?.label || '';
        let duration = durationToColon(accLabel);
        if (!duration) duration = durationToColon(subRuns.map((x) => x.text).join(' '));

        const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumbnail = toHDThumbnail(thumbs.length ? thumbs[thumbs.length - 1].url : '', videoId);

        return { title, thumbnail, duration, artist: stripTopic(artist), artistId };
      }
    }
  }
  return null;
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

  // Fallback kalau langkah pencarian di bawah tidak menemukan baris yang
  // cocok: ambil hanya artis UTAMA pertama dari byline (bukan digabung
  // semua run-nya), supaya minimal tidak menampilkan "Artis & Featuring".
  const bylineRuns = track?.shortBylineText?.runs || [];
  let fallbackArtist = '';
  let fallbackArtistId = '';
  for (const run of bylineRuns) {
    const text = run.text || '';
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (browseId.startsWith('UC') && !fallbackArtist) { fallbackArtist = text; fallbackArtistId = browseId; }
  }
  if (!fallbackArtist) fallbackArtist = (bylineRuns[0]?.text || '');
  fallbackArtist = stripTopic(fallbackArtist);

  const thumbnail = toHDThumbnail(
    (track?.thumbnail?.thumbnails || []).length
      ? track.thumbnail.thumbnails[track.thumbnail.thumbnails.length - 1].url
      : '',
    videoId
  );
  const duration = track?.lengthText?.simpleText || runsToText(track?.lengthText?.runs) || '';

  // Cross-check ke search YT Music (endpoint yang sama dipakai halaman
  // cari/beranda) supaya nama & id artis yang tampil konsisten dengan
  // tempat lain di aplikasi, bukan hasil parsing "next" yang kadang
  // menggabung artis utama + featuring jadi satu string.
  let matched = null;
  try {
    const searchJson = await searchSongs(title);
    matched = findSongRowByVideoId(searchJson, videoId);
  } catch { /* pakai fallback di bawah */ }

  return {
    videoId,
    title: matched?.title || title,
    thumbnail: matched?.thumbnail || thumbnail,
    duration: matched?.duration || duration,
    author: matched?.artist || fallbackArtist,
    artist: matched?.artist || fallbackArtist,
    artistId: matched?.artistId || fallbackArtistId
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
