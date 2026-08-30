import { getClientIp, isBlocked, notifyEvent, runBackground } from '$lib/server/activityMonitor.js';

const SECRET = 'msc_s3cr3t_g1vy_2026';
const ENC_KEY_HEX = '4d7a9c2e1f8b3a6d0e5c9f2b7a4e1d8c';
const SIGN_TTL = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function verifyFingerprint(request) {
  const ua = request.headers.get('user-agent') || '';
  const sec = request.headers.get('sec-fetch-dest') || '';
  if (!ua || ua.toLowerCase().includes('curl') || ua.toLowerCase().includes('python') || ua.toLowerCase().includes('wget')) return false;
  if (sec && sec !== 'empty') return false;
  return true;
}
async function verifySignature(sig, ts, q) {
  const now = Date.now();
  if (Math.abs(now - parseInt(ts)) > SIGN_TTL) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  try {
    return await crypto.subtle.verify('HMAC', key, hexToBytes(sig), enc.encode(`${ts}:${q}`));
  } catch {
    return false;
  }
}
async function encrypt(data) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', hexToBytes(ENC_KEY_HEX), { name: 'AES-CBC' }, false, ['encrypt']);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoded);
  return { d: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

function findAllKeys(obj, key, results) {
  if (obj === null || typeof obj !== 'object') return;
  if (obj[key] !== undefined) results.push(obj[key]);
  Object.values(obj).forEach(v => findAllKeys(v, key, results));
}

function toHDThumbnail(url, videoId) {
  if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (!url) return '';
  let hd = String(url);
  if (hd.includes('googleusercontent.com') || hd.includes('ggpht.com') || hd.includes('ytimg.com')) {
    if (/=w\d+-h\d+/i.test(hd)) hd = hd.replace(/=w\d+-h\d+[^?#]*/i, '=w800-h800-l90-rj');
    else if (/=s\d+/i.test(hd)) hd = hd.replace(/=s\d+[^?#]*/i, '=s800-c-k-c0x00ffffff-no-rj');
    else if (/=w\d+/i.test(hd)) hd = hd.replace(/=w\d+[^?#]*/i, '=w800-h800-l90-rj');
  }
  if (hd.includes('i.ytimg.com/vi/') || hd.includes('img.youtube.com/vi/')) {
    hd = hd.split('?')[0];
    hd = hd.replace(/(hqdefault|mqdefault|sddefault|default)\.jpg/i, 'hqdefault.jpg');
  }
  return hd;
}

function cleanTitle(title) {
  if (!title) return title;
  return title
    .replace(/[\(\[]\s*official\s+music\s+video\s*[\)\]]/gi, '(Official Music)')
    .replace(/[\(\[]\s*official\s+audio\s*[\)\]]/gi, '(Official Audio)')
    .replace(/[\(\[]\s*official\s+lyric[s]?\s+video\s*[\)\]]/gi, '(Official)')
    .replace(/[\(\[]\s*official\s+video\s*[\)\]]/gi, '(Official)')
    .replace(/[\(\[]\s*lyric[s]?\s+video\s*[\)\]]/gi, '')
    .replace(/[\(\[]\s*video\s+lirik\s*[\)\]]/gi, '')
    .replace(/[\(\[]\s*lirik\s*[\)\]]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function durationToColon(text) {
  if (!text) return '';
  const m = String(text).match(/(\d+)\s*(?:menit|min)\s*(?:(\d+)\s*(?:detik|det))?/i);
  if (m) return `${m[1]}:${(m[2] || '00').padStart(2, '0')}`;
  const m2 = String(text).match(/(\d+):(\d+)/);
  if (m2) return `${m2[1]}:${m2[2].padStart(2, '0')}`;
  return '';
}

async function fetchYoutube(query, type) {
  const payload = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
    query
  };
  if (type === 'songs') payload.params = 'EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO';
  else if (type === 'artists') payload.params = 'EgWKAQIgAWoKEAoQCRADEAA=';
  else if (type === 'all') delete payload.params;

  const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

function getRunsText(runs) { return Array.isArray(runs) ? runs.map(r => r.text || '').join('') : ''; }

function normalizeQuery(q) {
  return String(q || '').trim().replace(/\s+/g, ' ');
}


function extractRows(data) {
  if (!data) return [];
  const items = [];
  findAllKeys(data, 'musicResponsiveListItemRenderer', items);
  findAllKeys(data, 'musicTwoRowItemRenderer', items);
  const seen = {};
  const rows = [];
  for (const item of items) {
    const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (!browseId || seen[browseId]) continue;
    seen[browseId] = true;
    let title = '', subtitle = '', thumbs = [];
    if (item.flexColumns) {
      title = getRunsText(item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
      subtitle = getRunsText(item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
      thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    } else if (item.title?.runs) {
      title = getRunsText(item.title.runs);
      subtitle = getRunsText(item.subtitle?.runs);
      thumbs = item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    } else continue;
    const thumb = toHDThumbnail(thumbs.length ? thumbs[thumbs.length - 1].url : '');
    rows.push({ browseId, title, subtitle, thumb });
  }
  return rows;
}

function rowsToArtistMeta(rows) {
  const byId = new Map();
  for (const { browseId, title, subtitle, thumb } of rows) {
    const entry = { id: browseId, title, subtitle, cover: thumb };
    if (browseId && !byId.has(browseId)) byId.set(browseId, entry);
  }
  return byId;
}

function parseCompactCount(text) {
  if (!text) return 0;
  const m = String(text).toLowerCase().match(/([\d]+(?:[.,]\d+)?)\s*(rb|ribu|jt|juta|k|m|b)?/);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return 0;
  const unit = m[2];
  if (unit === 'rb' || unit === 'ribu' || unit === 'k') return num * 1e3;
  if (unit === 'jt' || unit === 'juta' || unit === 'm') return num * 1e6;
  if (unit === 'b') return num * 1e9;
  return num;
}

function buildArtistsFromSongs(songs, artistRows) {
  const byId = rowsToArtistMeta(artistRows);
  const candidates = new Map();

  songs.forEach((song, index) => {
    const name = (song.artist || '').trim();
    if (!name) return;
    const id = song.artistId || '';
    if (!id) return;
    const meta = byId.get(id);
    const key = id;
    const audience = meta ? parseCompactCount(meta.subtitle) : 0;
    const existing = candidates.get(key);
    if (existing) {
      existing.frequency += 1;
      existing.bestRank = Math.min(existing.bestRank, index);
    } else {
      candidates.set(key, {
        id,
        name: meta ? meta.title : name,
        cover: meta ? meta.cover : song.thumbnail || '',
        audience,
        frequency: 1,
        bestRank: index
      });
    }
  });

  const groups = new Map();
  for (const candidate of candidates.values()) {
    const groupKey = candidate.name.trim().toLowerCase();
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(candidate);
  }

  const merged = [];
  for (const group of groups.values()) {
    let representative = group[0];
    for (const candidate of group) {
      if (candidate.audience > representative.audience) representative = candidate;
      else if (candidate.audience === representative.audience && candidate.bestRank < representative.bestRank) representative = candidate;
    }
    merged.push({
      id: representative.id,
      title: representative.name,
      artist: representative.name,
      cover: representative.cover,
      bestRank: Math.min(...group.map(c => c.bestRank)),
      frequency: group.reduce((sum, c) => sum + c.frequency, 0),
      audience: representative.audience
    });
  }

  merged.sort((a, b) => {
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return b.audience - a.audience;
  });

  return merged.map(({ id, title, artist, cover }) => ({ id, title, artist, cover }));
}

function rowsToAlbumsAndPlaylists(rows) {
  const albums = [], playlists = [];
  for (const { browseId, title, subtitle, thumb } of rows) {
    const m = subtitle.match(/^(Album|Single|EP)\s*[•]\s*(.+?)\s*[•]\s*(\d{4})/i);
    if (m) albums.push({ id: browseId, title, artist: m[2].trim(), albumType: m[1], year: m[3], cover: thumb });
    else if (subtitle.toLowerCase().includes('playlist')) playlists.push({ id: browseId, title, artist: subtitle, cover: thumb });
  }
  return { albums, playlists };
}

function extractSongRows(data) {
  if (!data) return [];
  const out = [];
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of sections) {
      const shelf = section?.musicShelfRenderer;
      const items = shelf?.contents || section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const r = item?.musicResponsiveListItemRenderer;
        if (!r) continue;
        const cols = r.flexColumns || [];
        const title = getRunsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
        const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        let artist = '', artistId = '', album = '', albumId = '';
        for (const run of subRuns) {
          const text = run.text || '';
          const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
          if (browseId.startsWith('UC') && !artist) { artist = text; artistId = browseId; }
          else if (browseId.startsWith('MPRE') && !album) { album = text; albumId = browseId; }
        }
        // Some search rows don't expose a channel link (browseId) for the
        // artist run at all — e.g. featured/associated or unofficial-upload
        // artists. In that case fall back to position, but do it against the
        // *meaningful* runs (type label / '•' separators / duration text
        // stripped out) instead of a raw subRuns index, which used to land
        // on the '•' separator itself and show up as the artist name.
        if (!artist) {
          const durationLike = /^\d+:\d{2}(:\d{2})?$/;
          const meaningfulRuns = subRuns.filter(run => {
            const txt = (run.text || '').trim();
            return txt && txt !== '•' && txt !== '·' && txt !== '-';
          });
          for (let i = 0; i < meaningfulRuns.length; i++) {
            const txt = (meaningfulRuns[i].text || '').trim();
            if (i === 0) continue; // leading type label, e.g. "Song" / "Lagu" / "Video"
            if (durationLike.test(txt)) continue;
            if (album && txt === album) continue;
            artist = meaningfulRuns[i].text || '';
            break;
          }
        }
        const accLabel = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.accessibility?.accessibilityData?.label || '';
        let duration = durationToColon(accLabel);
        if (!duration) duration = durationToColon(subRuns.map(x => x.text).join(' '));
        const t = subRuns[0]?.text || '';
        if (t === 'Video') continue;
        const videoId = r?.playlistItemData?.videoId || '';
        if (!videoId) continue;
        const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const thumbnail = toHDThumbnail(thumbs.length ? thumbs[thumbs.length - 1].url : '', videoId);
        out.push({
          title: cleanTitle(title),
          videoId,
          thumbnail,
          duration,
          author: artist,
          artist,
          artistId,
          album: album || '',
          albumId
        });
      }
    }
  }
  return out;
}

function dedupeBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const SEARCH_CACHE_TTL = 60 * 1000;
const SEARCH_CACHE_MAX = 200;
const _searchCache = new Map();

function _cacheGet(key) {
  const entry = _searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > SEARCH_CACHE_TTL) { _searchCache.delete(key); return null; }
  return entry.v;
}
function _cacheSet(key, v) {
  _searchCache.set(key, { v, t: Date.now() });
  if (_searchCache.size > SEARCH_CACHE_MAX) {
    const oldestKey = _searchCache.keys().next().value;
    _searchCache.delete(oldestKey);
  }
}

async function performSearch(rawQuery) {
  const query = normalizeQuery(rawQuery);

  const cached = _cacheGet(query);
  if (cached) return cached;

  const [songsData, playlistsData, artistsData] = await Promise.all([
    fetchYoutube(query, 'songs').catch(() => null),
    fetchYoutube(query, 'playlists').catch(() => null),
    fetchYoutube(query, 'artists').catch(() => null)
  ]);

  const songs = dedupeBy(extractSongRows(songsData), s => s.videoId);
  const artists = buildArtistsFromSongs(songs, extractRows(artistsData));
  const { albums, playlists } = rowsToAlbumsAndPlaylists(extractRows(playlistsData));

  const result = {
    query,
    totalSongs: songs.length,
    songs,
    albums: dedupeBy(albums, a => a.id),
    playlists: dedupeBy(playlists, p => p.id),
    artists
  };

  _cacheSet(query, result);
  return result;
}

export async function GET({ url, request, platform }) {
  const q = url.searchParams.get('q') || '';
  const sig = url.searchParams.get('sig') || '';
  const ts = url.searchParams.get('ts') || '';
  const ip = getClientIp(request);

  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ e: 1 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!verifyFingerprint(request)) {
    return new Response(JSON.stringify({ e: 1 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!(await verifySignature(sig, ts, q))) {
    return new Response(JSON.stringify({ e: 1 }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const result = await performSearch(q);
    const payload = await encrypt(result);
    runBackground(platform, notifyEvent(platform, 'search', {
      ip,
      endpoint: 'GET /api/search',
      detail: { query: normalizeQuery(q) }
    }));
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ e: 1 }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
