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
function findAllKeys(obj, keyToFind, results) {
  if (!obj || typeof obj !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(obj, keyToFind)) results.push(obj[keyToFind]);
  for (const key of Object.keys(obj)) { if (typeof obj[key] === 'object') findAllKeys(obj[key], keyToFind, results); }
}

function durationColon(text) {
  if (!text) return '';
  const m = String(text).match(/(\d+):(\d+)/);
  if (m) return `${m[1]}:${m[2].padStart(2, '0')}`;
  return String(text);
}

// Ambil nama artis dengan cara EXACT SAMA seperti /api/artist (header
// musicImmersiveHeaderRenderer/musicVisualHeaderRenderer -> title.runs).
// Dipakai supaya nama artis di halaman Album dijamin identik dengan yang
// tampil di halaman Artist, bukan hasil tebakan dari header album yang
// formatnya suka beda-beda dan sering gagal (jatuh ke "Unknown Artist").
async function fetchArtistName(artistId) {
  if (!artistId) return '';
  try {
    const r = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'en', gl: 'ID' } }, browseId: artistId })
    });
    const d = await r.json();
    const h = d?.header?.musicImmersiveHeaderRenderer || d?.header?.musicVisualHeaderRenderer || {};
    return getRunsText(h.title?.runs || []);
  } catch {
    return '';
  }
}

export async function GET({ url }) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return new Response(JSON.stringify({ status: false, message: 'Parameter id wajib diisi' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    let browseId = id;
    if (!browseId.startsWith('VL') && browseId.startsWith('PL')) browseId = 'VL' + browseId;
    const isPlaylist = browseId.startsWith('VL');
    const clientName = isPlaylist ? 'WEB' : 'WEB_REMIX';
    const hostname = isPlaylist ? 'youtubei.googleapis.com' : 'music.youtube.com';

    const r = await fetch(`https://${hostname}/youtubei/v1/browse?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
      body: JSON.stringify({ context: { client: { clientName, clientVersion: isPlaylist ? '2.20240726.00.00' : '1.20240101.00.00', hl: 'en', gl: 'ID' } }, browseId })
    });
    const data = await r.json();

    let title = 'Unknown', description = '', thumbnails = [];
    const songs = [];

    if (isPlaylist) {
      const sidebars = [];
      findAllKeys(data, 'playlistSidebarPrimaryInfoRenderer', sidebars);
      if (sidebars.length > 0) {
        title = sidebars[0].title?.runs?.[0]?.text || sidebars[0].title?.simpleText || 'Unknown';
        description = getRunsText(sidebars[0].description?.runs || []);
        const thumbs = sidebars[0].thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails || sidebars[0].thumbnailRenderer?.playlistCustomThumbnailRenderer?.thumbnail?.thumbnails || data?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails || [];
        if (thumbs.length > 0) thumbnails = [{ url: thumbs[thumbs.length - 1].url.split('?')[0] }];
      }
      const lockups = [];
      findAllKeys(data, 'lockupViewModel', lockups);
      for (const lock of lockups) {
        const videoId = lock.contentId || '';
        if (!videoId || songs.find(s => s.videoId === videoId)) continue;
        const songTitle = lock.metadata?.lockupMetadataViewModel?.title?.content || 'Unknown';
        const rows = lock.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
        let artist = rows[0]?.metadataParts?.[0]?.text?.content || '';
        let duration = '';
        const a11yLabel = lock.rendererContext?.accessibilityContext?.label || '';
        const m = a11yLabel.match(/(\d+):(\d+)/);
        if (m) duration = `${m[1]}:${m[2].padStart(2, '0')}`;
        if (!duration) {
          const badges = lock.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges || [];
          if (badges[0]?.thumbnailBadgeViewModel?.text) duration = durationColon(badges[0].thumbnailBadgeViewModel.text);
        }
        const sources = lock.contentImage?.thumbnailViewModel?.image?.sources || [];
        const thumb = transformThumbs(sources.map(s => ({ url: s.url })), videoId);
        songs.push({ videoId, title: songTitle, artist: artist || 'Unknown', artistId: '', duration, thumbnail: thumb[0]?.url || '' });
      }
    } else {
      title = data?.microformat?.microformatDataRenderer?.title || 'Unknown Album';
      description = data?.microformat?.microformatDataRenderer?.description || '';
      thumbnails = data?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails || [];

      // YT Music tidak selalu memakai musicDetailHeaderRenderer untuk header
      // album — kadang musicImmersiveHeaderRenderer atau musicResponsiveHeaderRenderer,
      // sama seperti endpoint /api/artist. Kalau cuma cek satu key, h jadi {}
      // dan nama artis album gagal ke-extract sama sekali (jatuh ke "Unknown Artist").
      const h = data?.header?.musicDetailHeaderRenderer || data?.header?.musicImmersiveHeaderRenderer ||
        data?.header?.musicResponsiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || {};
      let headerThumbnails = h.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails || h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      if (thumbnails.length === 0 && headerThumbnails.length > 0) thumbnails = headerThumbnails;

      let items = data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents ||
        data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents;
      if (!items) {
        items = data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents ||
          data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents || [];
      }

      // Cara paling andal untuk nemu nama artis di header: bukan nebak field-nya
      // ("subtitle" vs "straplineTextOne" vs apapun skema terbaru YT Music),
      // tapi cari SEMUA run teks di seluruh subtree header yang link-nya beneran
      // mengarah ke channel artis (browseId diawali "UC"). Itu penanda paling
      // pasti "ini nama artis", terlepas dari field apa dia nempel.
      function collectArtistRuns(obj, out) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { for (const it of obj) collectArtistRuns(it, out); return; }
        if (Array.isArray(obj.runs)) {
          for (const run of obj.runs) {
            const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
            if (browseId.startsWith('UC') && run.text) out.push({ name: run.text, id: browseId });
          }
        }
        for (const key of Object.keys(obj)) { if (key !== 'runs') collectArtistRuns(obj[key], out); }
      }

      const headerArtists = [];
      collectArtistRuns(data?.header || {}, headerArtists);
      let albumArtist = headerArtists[0]?.name || '';
      let albumArtistId = headerArtists[0]?.id || '';

      // Begitu albumArtistId ketemu, timpa albumArtist dengan nama resmi hasil
      // fetch ke browseId artis itu (logic sama persis dgn /api/artist), biar
      // nama yang tampil di setiap lagu di halaman Album konsisten dan sama
      // dengan yang tampil di halaman Artist.
      if (albumArtistId) {
        const canonicalName = await fetchArtistName(albumArtistId);
        if (canonicalName) albumArtist = canonicalName;
      }

      // Kalau gak ada run yang link ke channel (kompilasi "Various Artists" atau
      // format header lain), coba baca teks subtitle/strapline apa adanya.
      if (!albumArtist) {
        let subtitleText = getRunsText(h.subtitle?.runs || []);
        if (subtitleText.includes(' • ')) {
          subtitleText = subtitleText.split(' • ').find(x => {
            const t = x.trim();
            return !['Album', 'Single', 'EP', 'Playlist'].includes(t) && !/^\d{4}$/.test(t);
          }) || '';
        } else if (['Album', 'Single', 'EP', 'Playlist'].includes(subtitleText.trim())) {
          subtitleText = '';
        }
        albumArtist = subtitleText || getRunsText(h.straplineTextOne?.runs || []);
      }
      if (!albumArtist) {
        const mat = title.match(/(?:Album|Single|EP)\s+by\s+(.+)$/i);
        if (mat) albumArtist = mat[1].trim();
      }

      // Pilih run artis yang benar dari kolom kedua, bukan asal gabung semua teks
      // (yang bisa berisi "Artist • plays" tergabung tanpa makna). Prioritaskan run
      // yang link-nya ke channel artis (browseId diawali "UC"); kalau tidak ada,
      // ambil run bermakna pertama yang bukan separator/durasi.
      function pickArtist(runs) {
        if (!Array.isArray(runs) || runs.length === 0) return { artist: '', artistId: '' };
        for (const run of runs) {
          const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
          if (browseId.startsWith('UC')) return { artist: run.text || '', artistId: browseId };
        }
        const durationLike = /^\d+:\d{2}(:\d{2})?$/;
        for (const run of runs) {
          const txt = (run.text || '').trim();
          if (!txt || txt === '•' || txt === '·' || txt === '-') continue;
          if (durationLike.test(txt)) continue;
          return { artist: txt, artistId: run?.navigationEndpoint?.browseEndpoint?.browseId || '' };
        }
        return { artist: '', artistId: '' };
      }

      for (const item of items) {
        if (item.musicResponsiveListItemRenderer) {
          const i = item.musicResponsiveListItemRenderer;
          const videoId = i.playlistItemData?.videoId || i.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || '';
          if (!videoId) continue;
          const songTitle = getRunsText(i.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
          const artistRuns = i.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          let { artist, artistId } = pickArtist(artistRuns);
          if (!artist) { artist = albumArtist || 'Unknown Artist'; artistId = artistId || albumArtistId; }
          const duration = durationColon(getRunsText(i.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []));
          const rawThumb = i.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const thumb = transformThumbs(rawThumb, videoId);
          songs.push({ videoId, title: songTitle, artist, artistId, duration, thumbnail: thumb[thumb.length - 1]?.url || '' });
        }
      }
    }

    thumbnails = transformThumbs(thumbnails);
    if (thumbnails.length === 0 && songs.length > 0) thumbnails = [{ url: songs[0].thumbnail }];

    return new Response(JSON.stringify({
      status: songs.length > 0 || isPlaylist,
      result: { id, title, description, cover: thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || '', songs }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: 'Gagal: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
