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
          if ((browseId.startsWith('UC') || browseId.startsWith('MPLA')) && !artist) { artist = text; artistId = browseId; }
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

function parseQueueTrack(track) {
  if (!track || !track.videoId) return null;
  const musicVideoType = track?.navigationEndpoint?.watchEndpoint
    ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
  if (musicVideoType === 'MUSIC_VIDEO_TYPE_OMV' || musicVideoType === 'MUSIC_VIDEO_TYPE_UGC') return null;

  const title = runsToText(track?.title?.runs).replace(/\s*\([^)]*\)\s*$/g, '');
  if (!title) return null;

  const bylineRuns = track?.shortBylineText?.runs || [];
  let artist = '', artistId = '';
  for (const run of bylineRuns) {
    const text = run.text || '';
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if ((browseId.startsWith('UC') || browseId.startsWith('MPLA')) && !artist) { artist = text; artistId = browseId; }
  }
  if (!artist) {
    const fallback = bylineRuns[0]?.text || '';
    const viewOrDateLike = /ditonton|dilihat|views?\b|\d+\s*(rb|jt|jT|juta|ribu)\b|(tahun|bulan|minggu|hari|jam|menit)\s*(yang\s*)?lalu/i;
    artist = viewOrDateLike.test(fallback) ? '' : fallback;
  }
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

async function fetchQueuePanel(videoId, withMix) {
  const body = withMix ? { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true } : { videoId, isAudioOnly: true };
  const json = await musicPost('next', body);
  return json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
    ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
    ?.content?.playlistPanelRenderer;
}

function pickPrimaryTrack(queue, videoId) {
  return (
    queue?.contents?.find((c) => c.playlistPanelVideoRenderer?.videoId === videoId)
      ?.playlistPanelVideoRenderer ||
    queue?.contents?.find((c) => c.playlistPanelVideoRenderer?.selected)
      ?.playlistPanelVideoRenderer ||
    queue?.contents?.[0]?.playlistPanelVideoRenderer ||
    null
  );
}

// Parse renderer track dari panel 'next' jadi bentuk dasar (title, thumbnail,
// duration, fallback artist) - dipakai bareng oleh versi lengkap (fetchTrackMeta)
// dan versi ringan (fetchTrackMetaLight), supaya logic parsing gak kedobelan.
function parsePrimaryTrack(track, videoId) {
  const title = runsToText(track?.title?.runs).replace(/\s*\([^)]*\)\s*$/g, '');
  if (!title) return null;

  const bylineRuns = track?.shortBylineText?.runs || [];
  let fallbackArtist = '';
  let fallbackArtistId = '';
  for (const run of bylineRuns) {
    const text = run.text || '';
    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if ((browseId.startsWith('UC') || browseId.startsWith('MPLA')) && !fallbackArtist) { fallbackArtist = text; fallbackArtistId = browseId; }
  }
  if (!fallbackArtist) {
    const fallback = bylineRuns[0]?.text || '';
    const viewOrDateLike = /ditonton|dilihat|views?\b|\d+\s*(rb|jt|jT|juta|ribu)\b|(tahun|bulan|minggu|hari|jam|menit)\s*(yang\s*)?lalu/i;
    fallbackArtist = viewOrDateLike.test(fallback) ? '' : fallback;
  }
  fallbackArtist = stripTopic(fallbackArtist);

  const thumbnail = toHDThumbnail(
    (track?.thumbnail?.thumbnails || []).length
      ? track.thumbnail.thumbnails[track.thumbnail.thumbnails.length - 1].url
      : '',
    videoId
  );
  const duration = track?.lengthText?.simpleText || runsToText(track?.lengthText?.runs) || '';

  return { title, thumbnail, duration, fallbackArtist, fallbackArtistId };
}

// Refine hasil parsePrimaryTrack pakai satu request search ke YT Music -
// ini yang ngasih nama artis "bersih" (bukan channel "- Topic") dan
// thumbnail resolusi tinggi yang konsisten sama section pencarian di app.
async function refineWithSearch(videoId, base) {
  let matched = null;
  try {
    const searchJson = await searchSongs(base.title);
    matched = findSongRowByVideoId(searchJson, videoId);
  } catch { }

  return {
    videoId,
    title: matched?.title || base.title,
    thumbnail: matched?.thumbnail || base.thumbnail,
    duration: matched?.duration || base.duration,
    author: matched?.artist || base.fallbackArtist,
    artist: matched?.artist || base.fallbackArtist,
    artistId: matched?.artistId || base.fallbackArtistId
  };
}

export async function fetchTrackMeta(videoId) {
  let queue = await fetchQueuePanel(videoId, true);

  if (!queue?.contents || queue.contents.length <= 1) {
    try {
      const plain = await fetchQueuePanel(videoId, false);
      if (plain?.contents?.length > (queue?.contents?.length || 0)) queue = plain;
    } catch { }
  }

  const track = pickPrimaryTrack(queue, videoId);
  if (!track) return null;

  const upNext = (queue?.contents || [])
    .map((c) => parseQueueTrack(c.playlistPanelVideoRenderer))
    .filter(Boolean);

  const needsResolve = upNext.filter((t) => !t.artistId).slice(0, 20);
  if (needsResolve.length) {
    const resolved = await Promise.allSettled(
      needsResolve.map(async (t) => {
        const searchJson = await searchSongs(t.title);
        return { videoId: t.videoId, match: findSongRowByVideoId(searchJson, t.videoId) };
      })
    );
    const byId = new Map();
    for (const r of resolved) {
      if (r.status === 'fulfilled' && r.value.match?.artistId) byId.set(r.value.videoId, r.value.match);
    }
    for (const t of upNext) {
      const match = byId.get(t.videoId);
      if (match) { t.artist = match.artist; t.author = match.artist; t.artistId = match.artistId; }
    }
  }

  const base = parsePrimaryTrack(track, videoId);
  if (!base) return null;

  const refined = await refineWithSearch(videoId, base);
  return { ...refined, queue: upNext };
}

// --- Versi ringan, khusus buat metadata share/OG preview -------------------
// Beda sama fetchTrackMeta: TIDAK pernah minta mix/radio ('next' dengan
// playlistId) dan TIDAK resolve artist buat seluruh antrian up-next (itu
// yang bikin /song/[id] lemot - bisa nembak sampai puluhan request cuma
// buat nyiapin daftar "lagu serupa" yang sama sekali gak dipakai di preview
// share). Total cuma 2 request berurutan: panel 'next' polos + 1 search
// buat ngerapihin nama artis & ambil thumbnail resolusi tinggi.

const _lightMetaCache = new Map();
const LIGHT_META_TTL = 10 * 60 * 1000; // 10 menit - cukup buat nahan burst klik dari 1 link yang lagi rame dibagikan, tanpa perlu KV/D1 binding baru.
const LIGHT_META_MAX = 200;

function _lightCacheGet(id) {
  const hit = _lightMetaCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.time > LIGHT_META_TTL) { _lightMetaCache.delete(id); return null; }
  return hit.data;
}

function _lightCacheSet(id, data) {
  if (_lightMetaCache.size >= LIGHT_META_MAX) {
    const oldestKey = _lightMetaCache.keys().next().value;
    if (oldestKey) _lightMetaCache.delete(oldestKey);
  }
  _lightMetaCache.set(id, { data, time: Date.now() });
}

async function _withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Fallback paling ringan kalau YT Music internal API lelet/gagal: oEmbed
// publik YouTube, satu GET tanpa API key, biasanya nyala <1 request roundtrip.
async function _oembedFallback(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const r = await fetch(oembedUrl);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.title) return null;
    return {
      videoId,
      title: j.title,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      duration: '',
      author: stripTopic(j.author_name || ''),
      artist: stripTopic(j.author_name || ''),
      artistId: ''
    };
  } catch {
    return null;
  }
}

export async function fetchTrackMetaLight(videoId) {
  const cached = _lightCacheGet(videoId);
  if (cached) return cached;

  let result = null;
  try {
    // Batasi total waktu tunggu YT Music internal API supaya crawler share
    // preview (WhatsApp/Telegram/dll) gak nunggu lama - kalau lewat 4 detik,
    // langsung jatuh ke oEmbed daripada bikin preview telat/gagal muncul.
    result = await _withTimeout((async () => {
      const queue = await fetchQueuePanel(videoId, false);
      const track = pickPrimaryTrack(queue, videoId);
      if (!track) return null;
      const base = parsePrimaryTrack(track, videoId);
      if (!base) return null;
      return refineWithSearch(videoId, base);
    })(), 4000);
  } catch {
    result = null;
  }

  if (!result) result = await _oembedFallback(videoId);
  if (!result) return null;

  _lightCacheSet(videoId, result);
  return result;
}
