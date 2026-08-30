const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

function getRunsText(r) { return Array.isArray(r) ? r.map(x => x.text || '').join('') : ''; }

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
    let description = getRunsText(h.description?.runs || []);

    // Fallback terakhir kalau header di atas semua gak ke-match (mis. YT
    // Music ganti struktur lagi ke depannya): microformat SELALU ada di
    // response browse & isinya title/description/thumbnail dasar halaman,
    // jadi minimal nama & foto artis tetap ke-tampil walau section-section
    // detailnya mungkin gagal parse.
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
