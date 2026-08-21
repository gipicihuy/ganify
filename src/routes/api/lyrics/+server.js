const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

function cleanT(t) {
  return String(t || '').replace(/(\(.*(official|lyric|video|audio).*\)|\[.*(official|lyric|video|audio).*\]|-.*(official|lyric|video|audio).*)/gi, '').trim();
}
function cleanA(a) { return String(a || '').replace(/- Topic/gi, '').trim(); }

function stripFeat(t) {
  return String(t || '')
    .replace(/[([]\s*(feat|ft|featuring)\.?\s+[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat|ft|featuring)\.?\s+.*/i, '')
    .trim();
}

function parseSyncedLyrics(s) {
  const lines = [];
  const p = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)/;
  for (const l of s.split('\n')) {
    const m = l.trim().match(p);
    if (m) {
      let ms = 0;
      if (m[3]) ms = m[3].length === 3 ? parseInt(m[3]) / 1000 : parseInt(m[3]) / 100;
      lines.push({ time: Math.round((parseInt(m[1]) * 60 + parseInt(m[2]) + ms) * 100) / 100, text: m[4].trim() || '• • •' });
    }
  }
  return lines;
}
function parsePlainLyrics(p) {
  return p.split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ time: -1, text: t }));
}

const DURATION_TOLERANCE = 3;
const MIN_MATCH_SCORE = 0.3;
const TOP_MATCH_MARGIN = 0.12;

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(featuring|feat\.?|ft\.?)\b/g, 'feat')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isSubset(small, big) {
  if (!small.size) return false;
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

function identityScore(cand, title, artist) {
  const reqTokens = tokenSet(`${title} ${artist}`);
  const candTokens = tokenSet(`${cand.trackName} ${cand.artistName}`);
  const j = jaccard(reqTokens, candTokens);
  const bonus = (isSubset(candTokens, reqTokens) || isSubset(reqTokens, candTokens)) ? 0.15 : 0;
  return Math.min(1, j + bonus);
}

function durationDiff(cand, duration) {
  return (duration && cand.duration) ? Math.abs(cand.duration - duration) : null;
}

function withinDurationTolerance(entry) {
  return entry.durDiff === null || entry.durDiff <= DURATION_TOLERANCE;
}

function byDurationThenScore(a, b) {
  const da = a.durDiff === null ? Infinity : a.durDiff;
  const db = b.durDiff === null ? Infinity : b.durDiff;
  if (da !== db) return da - db;
  return b.score - a.score;
}

function toResult(entry) {
  return { type: entry.c.syncedLyrics ? 'synced' : 'plain', item: entry.c };
}

function pickBestLyrics(candidates, title, artist, duration) {
  const evaluated = candidates
    .filter(c => c.plainLyrics || c.syncedLyrics)
    .map(c => ({
      c,
      score: identityScore(c, title, artist),
      durDiff: durationDiff(c, duration)
    }))
    .filter(x => x.score >= MIN_MATCH_SCORE);

  if (!evaluated.length) return null;

  evaluated.sort((a, b) => b.score - a.score);
  const bestScore = evaluated[0].score;
  const finalists = evaluated.filter(x => x.score >= bestScore - TOP_MATCH_MARGIN);

  if (finalists.length === 1) return toResult(finalists[0]);

  const syncedInTol = finalists.filter(x => x.c.syncedLyrics && withinDurationTolerance(x)).sort(byDurationThenScore);
  if (syncedInTol.length) return toResult(syncedInTol[0]);

  const plainInTol = finalists.filter(x => x.c.plainLyrics && withinDurationTolerance(x)).sort(byDurationThenScore);
  if (plainInTol.length) return toResult(plainInTol[0]);

  finalists.sort((a, b) => {
    const aSynced = a.c.syncedLyrics ? 1 : 0;
    const bSynced = b.c.syncedLyrics ? 1 : 0;
    if (aSynced !== bSynced) return bSynced - aSynced;
    return byDurationThenScore(a, b);
  });
  return toResult(finalists[0]);
}

async function searchLrclib(q) {
  if (!q) return [];
  const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function dedupeCandidates(lists) {
  const seen = new Set();
  const candidates = [];
  for (const list of lists) {
    for (const c of list) {
      if (c && c.id != null && !seen.has(c.id)) {
        seen.add(c.id);
        candidates.push(c);
      }
    }
  }
  return candidates;
}

export async function GET({ url }) {
  const title = (url.searchParams.get('title') || '').trim();
  const artist = (url.searchParams.get('artist') || '').trim();
  const durationParam = url.searchParams.get('duration');
  const duration = durationParam && isFinite(+durationParam) ? +durationParam : null;
  if (!title) return new Response(JSON.stringify({ status: false, message: 'Parameter title wajib diisi' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    let lyricsData = { type: 'none', lines: [] };
    const cleanTitle = cleanT(title);
    const cleanArtist = cleanA(artist);
    const searchTitle = stripFeat(cleanTitle) || cleanTitle;

    const [primary, secondary] = await Promise.all([
      searchLrclib(`${searchTitle} ${cleanArtist}`.trim()),
      searchTitle !== cleanTitle ? searchLrclib(`${cleanTitle} ${cleanArtist}`.trim()) : Promise.resolve([])
    ]);
    const candidates = dedupeCandidates([primary, secondary]);

    if (candidates.length) {
      const best = pickBestLyrics(candidates, cleanTitle, cleanArtist, duration);
      if (best) {
        lyricsData = best.type === 'synced'
          ? { type: 'synced', lines: parseSyncedLyrics(best.item.syncedLyrics) }
          : { type: 'plain', lines: parsePlainLyrics(best.item.plainLyrics) };
      }
    }
    return new Response(JSON.stringify({ status: true, result: { title, artist, lyrics: lyricsData } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: 'Gagal: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
