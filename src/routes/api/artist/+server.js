const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

function getRunsText(r) { return Array.isArray(r) ? r.map(x => x.text || '').join('') : ''; }

// YT Music/Innertube kadang bungkus link eksternal (mis. ke Wikipedia) lewat
// endpoint redirect internal (`/redirect?q=<target>`), bukan URL final
// langsung. Kalau ini gak di-unwrap, link "Wikipedia"/"Creative Commons" di
// attribution bakal ngarah ke youtube.com, bukan ke sumber aslinya.
function resolveExternalUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl, 'https://music.youtube.com');
    if (u.pathname === '/redirect' && u.searchParams.get('q')) return u.searchParams.get('q');
    return u.toString();
  } catch {
    return rawUrl;
  }
}
function hostnameOf(u) {
  if (!u) return '';
  try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
}

// Ubah runs jadi list segmen {text, url, start, end} dengan index karakter
// di dalam full-text gabungannya, biar bisa dipotong per-rentang karakter
// tanpa merusak/mengubah teks & link asli tiap run.
function buildRunSegments(runs) {
  let pos = 0;
  return (Array.isArray(runs) ? runs : []).map(r => {
    const text = r.text || '';
    const seg = { text, url: resolveExternalUrl(r.navigationEndpoint?.urlEndpoint?.url || null), start: pos, end: pos + text.length };
    pos += text.length;
    return seg;
  });
}
function sliceRunSegments(segments, from, to) {
  const out = [];
  for (const s of segments) {
    const segFrom = Math.max(s.start, from);
    const segTo = Math.min(s.end, to);
    if (segFrom < segTo) out.push({ text: s.text.slice(segFrom - s.start, segTo - s.start), url: s.url });
  }
  return out;
}

// Bio dari header (h.description.runs) kadang diakhiri paragraf attribution
// resmi dari Google Knowledge Graph ("From Wikipedia ... under Creative
// Commons ..."), lengkap dengan link ke wikipedia.org & creativecommons.org
// di dalam run-nya masing-masing. Sebelum ini, `getRunsText` cuma nge-join
// semua run jadi satu string polos — link-nya ke-drop total, dan potongan
// attribution ini nyampur jadi satu sama bio (ketimpa clamp bio juga).
// Fungsi ini misahin bio vs attribution HANYA kalau link ke kedua domain itu
// beneran ada di data (gak pernah bikin attribution kalau sumbernya gak
// nyediain), dan gak mengubah teks asli tiap segmennya sama sekali.
function splitBioAndAttribution(runs) {
  const segments = buildRunSegments(runs);
  const fullText = segments.map(s => s.text).join('');
  let wikiStart = -1, hasCC = false;
  for (const s of segments) {
    const host = hostnameOf(s.url);
    if (host.endsWith('wikipedia.org') && wikiStart === -1) wikiStart = s.start;
    if (host.endsWith('creativecommons.org')) hasCC = true;
  }
  if (wikiStart === -1 || !hasCC) return { bio: fullText, attribution: null };

  const boundary = fullText.lastIndexOf('\n\n', wikiStart);
  if (boundary === -1) return { bio: fullText, attribution: null };

  const bio = fullText.slice(0, boundary).trimEnd();
  const attribution = sliceRunSegments(segments, boundary + 2, fullText.length).filter(s => s.text.length > 0);
  return { bio, attribution: attribution.length ? attribution : null };
}

// Parser angka ringkas (mendukung notasi EN "10.8M"/"1.2K" maupun ID
// "10,8 jt"/"1,2 rb") jadi integer mentah. Cuma dipakai buat teks yang udah
// lolos pengecekan keyword monthly audience di extractMonthlyAudience —
// gak pernah dipanggil buat nebak-nebak angka dari teks lain.
function parseCompactNumber(text) {
  if (!text) return null;
  const m = String(text).match(/([\d]+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|m|miliar|b)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'rb' || unit === 'ribu' || unit === 'k') return Math.round(num * 1e3);
  if (unit === 'jt' || unit === 'juta' || unit === 'm') return Math.round(num * 1e6);
  if (unit === 'miliar' || unit === 'b') return Math.round(num * 1e9);
  return Math.round(num);
}

// "Monthly audience"/"monthly listeners" adalah metrik BEDA dari subscriber
// count biasa (YT Music sedang rollout bertahap metrik ini menggantikan
// subscriber count di sebagian artist — lihat 9to5google.com/2025/01/07/
// youtube-music-monthly-audience-metric). Makanya di sini sengaja HANYA
// nerima teks yang eksplisit nyebut "monthly listeners/audience" (atau
// padanan ID-nya) sebagai sumber angka; subscriber count generik ("X
// subscribers") sengaja gak dipakai sebagai pengganti, karena itu akan
// nampilin metrik yang salah/bukan yang diminta.
function extractMonthlyAudience(h) {
  const candidates = [
    // Field asli dari Innertube buat metrik ini: `header.monthlyListenerCount.runs[0].text`
    // (mis. "29.1M monthly audience") - dikonfirmasi dari source resmi ytmusicapi
    // (ytmusicapi/mixins/browsing.py: `nav(header, ["monthlyListenerCount", "runs", 0, "text"])`).
    // Field ini ROOT CAUSE-nya kenapa angka gak pernah muncul: sebelum ini candidate list
    // cuma ngecek secondSubtitle/subscriptionButton/subtitle, yang semuanya BUKAN lokasi
    // metrik ini - jadi extractMonthlyAudience selalu return null walau datanya beneran ada
    // di response YT Music. Taruh paling pertama karena ini sumber paling akurat & langsung.
    getRunsText(h.monthlyListenerCount?.runs || []),
    getRunsText(h.secondSubtitle?.runs || []),
    getRunsText(h.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText?.runs || []),
    getRunsText(h.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.runs || []),
    getRunsText(h.subtitle?.runs || [])
  ];
  for (const c of candidates) {
    if (/monthly\s+(listeners?|audience)/i.test(c) || /(pendengar|audiens)\s+bulanan/i.test(c)) {
      const n = parseCompactNumber(c);
      if (n !== null) return n;
    }
  }
  return null;
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
function transformThumbs(thumbs, videoId) {
  if (!Array.isArray(thumbs) || thumbs.length === 0) return videoId ? [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }] : [];
  return thumbs.map(t => ({ ...t, url: toHDThumbnail(t.url, videoId) }));
}
function durationColon(text) {
  if (!text) return '';
  const m = String(text).match(/(\d+):(\d+)/);
  if (m) return `${m[1]}:${m[2].padStart(2, '0')}`;
  return '';
}

export async function GET({ url }) {
  const artistId = (url.searchParams.get('id') || '').trim();
  if (!artistId) return new Response(JSON.stringify({ status: false, message: 'Parameter id wajib diisi' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const r = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'en', gl: 'ID' } }, browseId: artistId })
    });
    const data = await r.json();

    let name = '', thumbnails = [];
    const topSongs = [], topAlbums = [], topSingles = [], playlists = [], similarArtists = [];

    // YT Music GAK selalu pakai musicImmersiveHeaderRenderer buat header
    // artist page — itu cuma dipakai buat artis yang dapat treatment
    // "immersive" (banner promo besar). Kebanyakan artist page lain (mis.
    // Taylor Swift, Justin Bieber, dst di layout terbaru) headernya
    // musicResponsiveHeaderRenderer, dan sebagian pakai musicVisualHeaderRenderer
    // atau bahkan musicDetailHeaderRenderer. Sebelum ini cuma 2 dari 4 varian
    // yang dicek, jadi utk artis yang headernya bukan salah satu dari itu,
    // `h` jatuh ke {} dan name/thumbnail-nya kosong total — artist page
    // ke-render tapi blank/gak lengkap. (Endpoint /api/album udah lebih dulu
    // nemuin & fix masalah yang sama persis buat halaman album.)
    const h = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicDetailHeaderRenderer ||
      data?.header?.musicResponsiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || {};
    name = getRunsText(h.title?.runs || []);
    let headerThumbs = h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      h.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails || [];
    thumbnails = transformThumbs(headerThumbs);
    const { bio: bioFromRuns, attribution } = splitBioAndAttribution(h.description?.runs || []);
    let description = bioFromRuns;
    const monthlyAudience = extractMonthlyAudience(h);

    // Fallback terakhir kalau header di atas semua gak ke-match (mis. YT
    // Music ganti struktur lagi ke depannya): microformat SELALU ada di
    // response browse & isinya title/description/thumbnail dasar halaman,
    // jadi minimal nama & foto artis tetap ke-tampil walau section-section
    // detailnya mungkin gagal parse. microformat gak punya runs/link, jadi
    // gak ada attribution buat kasus fallback ini.
    if (!name) name = data?.microformat?.microformatDataRenderer?.title || '';
    if (!description) description = data?.microformat?.microformatDataRenderer?.description || '';
    if (thumbnails.length === 0) {
      const mfThumbs = data?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails || [];
      if (mfThumbs.length) thumbnails = transformThumbs(mfThumbs);
    }

    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
      const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const sec of contents) {
        if (sec.musicShelfRenderer) {
          for (const item of sec.musicShelfRenderer.contents || []) {
            if (item.musicResponsiveListItemRenderer) {
              const i = item.musicResponsiveListItemRenderer;
              const videoId = i.playlistItemData?.videoId || '';
              const rawThumbs = i.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const thumbs = transformThumbs(rawThumbs, videoId);
              const durTxt = getRunsText(i.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []);
              topSongs.push({
                videoId,
                title: getRunsText(i.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []),
                artist: name,
                artistId,
                duration: durationColon(durTxt),
                thumbnail: thumbs[thumbs.length - 1]?.url || ''
              });
            }
          }
        }
        if (sec.musicCarouselShelfRenderer) {
          const car = sec.musicCarouselShelfRenderer;
          const ht = getRunsText(car.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs || []);
          for (const item of car.contents || []) {
            if (item.musicTwoRowItemRenderer) {
              const it = item.musicTwoRowItemRenderer;
              const rawItemThumbs = it.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              const vId = it.navigationEndpoint?.watchEndpoint?.videoId || '';
              const thumbs = transformThumbs(rawItemThumbs, vId);
              const parsed = {
                title: getRunsText(it.title?.runs || []),
                artist: getRunsText(it.subtitle?.runs || []),
                id: it.navigationEndpoint?.browseEndpoint?.browseId || it.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
                cover: thumbs[thumbs.length - 1]?.url || ''
              };
              if (/album/i.test(ht)) topAlbums.push(parsed);
              else if (/singles|ep/i.test(ht)) topSingles.push(parsed);
              else if (/playlist/i.test(ht)) playlists.push(parsed);
              else if (/similar|fans/i.test(ht)) similarArtists.push(parsed);
            }
          }
        }
      }
    }

    // browseId yang gak valid/gak dikenali YT Music biasanya tetap balik
    // response 200 (bukan error), cuma header & semua section-nya kosong.
    // Tanpa cek ini, endpoint selalu balikin status:true walau isinya
    // kosong total — front-end (halaman /artist) nganggepnya "artist
    // ditemukan" padahal harusnya nampilin state "tidak ditemukan".
    const hasContent = !!name || topSongs.length || topAlbums.length || topSingles.length || similarArtists.length;
    if (!hasContent) {
      return new Response(JSON.stringify({ status: false, message: 'Artis tidak ditemukan' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      status: true,
      result: {
        artistId,
        name,
        description,
        attribution,
        monthlyAudience,
        cover: thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || '',
        topSongs: topSongs.slice(0, 12),
        topAlbums: topAlbums.slice(0, 10),
        topSingles: topSingles.slice(0, 10),
        playlists: playlists.slice(0, 10),
        similarArtists: similarArtists.slice(0, 10)
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: 'Gagal: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
