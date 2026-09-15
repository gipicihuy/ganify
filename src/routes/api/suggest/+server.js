const MUSIC_BASE = 'https://music.youtube.com';
const MUSIC_API = MUSIC_BASE + '/youtubei/v1';
const MUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CLIENT_VERSION = '1.20260804.16.00';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const PAGE_TYPE_ARTIST = 'MUSIC_PAGE_TYPE_ARTIST';
const PAGE_TYPE_LIBRARY_ARTIST = 'MUSIC_PAGE_TYPE_LIBRARY_ARTIST';
const PAGE_TYPE_ALBUM = 'MUSIC_PAGE_TYPE_ALBUM';
const PAGE_TYPE_AUDIOBOOK = 'MUSIC_PAGE_TYPE_AUDIOBOOK';
const PAGE_TYPE_PLAYLIST = 'MUSIC_PAGE_TYPE_PLAYLIST';

function getRunsText(runs) {
  return Array.isArray(runs) ? runs.map(r => r.text || '').join('') : '';
}

function stripTopic(name) {
  return (name || '').replace(/\s*-\s*topic\s*$/i, '').trim();
}

function toHDThumbnail(url, id) {
  if (!url && id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return url || '';
}

async function fetchSuggestions(input) {
  const payload = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: MUSIC_CLIENT_VERSION,
        hl: 'id',
        gl: 'ID',
        userAgent: UA
      }
    },
    input
  };
  const r = await fetch(`${MUSIC_API}/music/get_search_suggestions?key=${MUSIC_API_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'X-Youtube-Client-Name': '67',
      'X-Youtube-Client-Version': MUSIC_CLIENT_VERSION,
      Origin: MUSIC_BASE,
      Referer: MUSIC_BASE + '/'
    },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

function parseRecommendedItem(renderer) {
  if (!renderer) return null;
  const cols = renderer.flexColumns || [];
  const title = getRunsText(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
  if (!title) return null;

  const thumbs = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const pageType = renderer?.navigationEndpoint?.browseEndpoint
    ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

  const overlayWatchId = renderer?.overlay?.musicItemThumbnailOverlayRenderer
    ?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || '';
  const videoId = renderer?.playlistItemData?.videoId || overlayWatchId || '';

  const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = getRunsText(subRuns);

  if (videoId) {
    let artist = '';
    for (const run of subRuns) {
      const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
      if (browseId.startsWith('UC') || browseId.startsWith('MPLA')) { artist = run.text || ''; break; }
    }
    return {
      type: 'song',
      videoId,
      title,
      artist: stripTopic(artist || subtitle),
      thumbnail: toHDThumbnail(thumbs.length ? thumbs[thumbs.length - 1].url : '', videoId)
    };
  }

  const browseId = renderer?.navigationEndpoint?.browseEndpoint?.browseId || '';
  if (!browseId) return null;

  if (pageType === PAGE_TYPE_ARTIST || pageType === PAGE_TYPE_LIBRARY_ARTIST) {
    return { type: 'artist', id: browseId, title, thumbnail: toHDThumbnail(thumbs[0]?.url, browseId) };
  }
  if (pageType === PAGE_TYPE_ALBUM || pageType === PAGE_TYPE_AUDIOBOOK) {
    return { type: 'album', id: browseId, title, artist: subtitle, thumbnail: toHDThumbnail(thumbs[0]?.url, browseId) };
  }
  if (pageType === PAGE_TYPE_PLAYLIST) {
    return { type: 'playlist', id: browseId.replace(/^VL/, ''), title, artist: subtitle, thumbnail: toHDThumbnail(thumbs[0]?.url, browseId) };
  }
  return null;
}

export async function GET({ url }) {
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) return new Response(JSON.stringify({ queries: [], items: [] }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const data = await fetchSuggestions(q);
    const sections = data?.contents || [];

    const queries = (sections[0]?.searchSuggestionsSectionRenderer?.contents || [])
      .map(c => getRunsText(c?.searchSuggestionRenderer?.suggestion?.runs))
      .filter(Boolean)
      .slice(0, 8);

    const items = (sections[1]?.searchSuggestionsSectionRenderer?.contents || [])
      .map(c => parseRecommendedItem(c?.musicResponsiveListItemRenderer))
      .filter(Boolean)
      .slice(0, 10);

    return new Response(JSON.stringify({ queries, items }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ queries: [], items: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
}
