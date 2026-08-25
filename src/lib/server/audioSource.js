const UA = 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36';
const KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';

const CDNS = ['cdn405.savetube.vip', 'cdn403.savetube.vip', 'cdn401.savetube.vip'];
const ATTEMPT_TIMEOUT = 10000;

const MUSIC_BASE = 'https://music.youtube.com';
const MUSIC_API = MUSIC_BASE + '/youtubei/v1';
const MUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const MUSIC_CLIENT_VERSION = '1.20260804.16.00';
const MUSIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const YTMP3_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YTMP3_MAX_POLLS = 60;

let cachedSignatureTimestamp;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptSavetube(encryptedB64) {
  const raw = base64ToBytes(encryptedB64);
  const iv = raw.slice(0, 16);
  const data = raw.slice(16);
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(KEY_HEX),
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    data
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function fetchJsonWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function trySingleCdn(cdn, videoId, headers, fullUrl) {
  const infoJson = await fetchJsonWithTimeout(
    `https://${cdn}/v2/info`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: fullUrl })
    },
    ATTEMPT_TIMEOUT
  );

  const encryptedData = infoJson?.data;

  if (!encryptedData) {
    throw new Error(`${cdn}: no data in /v2/info response`);
  }

  const decrypted = await decryptSavetube(encryptedData);

  const dlJson = await fetchJsonWithTimeout(
    `https://${cdn}/download`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: videoId,
        downloadType: 'audio',
        quality: '128',
        key: decrypted.key
      })
    },
    ATTEMPT_TIMEOUT
  );

  const downloadUrl = dlJson?.data?.downloadUrl || dlJson?.downloadUrl;

  if (!downloadUrl) {
    throw new Error(`${cdn}: no downloadUrl in /download response`);
  }

  return downloadUrl;
}

async function savetube(videoId) {
  const headers = {
    'content-type': 'application/json',
    origin: 'https://yt.savetube.me',
    'user-agent': UA
  };

  const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const results = await Promise.allSettled(
    CDNS.map(cdn => trySingleCdn(cdn, videoId, headers, fullUrl))
  );

  const success = results.find(r => r.status === 'fulfilled');

  if (success) return success.value;

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `[stream] CDN ${CDNS[i]} failed:`,
        r.reason?.message || r.reason
      );
    }
  });

  return null;
}

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

async function getSignatureTimestamp() {
  if (cachedSignatureTimestamp) return cachedSignatureTimestamp;
  const html = await fetch(MUSIC_BASE + '/', { headers: { 'User-Agent': MUSIC_USER_AGENT } }).then((r) => r.text());
  const playerJs = html.match(/\/s\/player\/[^"']*base\.js/)?.[0];
  if (!playerJs) throw new Error('Unable to locate player script');
  const js = await fetch(MUSIC_BASE + playerJs, { headers: { 'User-Agent': MUSIC_USER_AGENT } }).then((r) => r.text());
  cachedSignatureTimestamp = Number(js.match(/signatureTimestamp:(\d+)/)?.[1] || 0);
  return cachedSignatureTimestamp;
}

async function findSongVideoId(videoId) {
  const json = await musicPost('next', { videoId, isAudioOnly: true });
  const queue =
    json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
      ?.content?.playlistPanelRenderer;
  const track =
    queue?.contents?.find((c) => c.playlistPanelVideoRenderer?.selected)
      ?.playlistPanelVideoRenderer ||
    queue?.contents?.[0]?.playlistPanelVideoRenderer;
  const title = runsToText(track?.title?.runs).replace(/\s*\([^)]*\)\s*$/g, '');
  const artist = runsToText(track?.shortBylineText?.runs);
  const query = `${title} ${artist}`.trim();
  if (!query) return null;

  const searchJson = await musicPost('search', { query, params: 'EgWKAQIIAWoMEA4QChADEAQQCRAF' });
  const sections =
    searchJson.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents || [];

  for (const section of sections) {
    const shelf = section.musicShelfRenderer;
    if (!shelf) continue;
    const items = shelf.contents || [];
    for (const item of items) {
      const renderer = item.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const videoIdCandidate = renderer?.navigationEndpoint?.watchEndpoint?.videoId ||
                              renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
      if (videoIdCandidate && videoIdCandidate !== videoId) {
        return videoIdCandidate;
      }
    }
  }
  return null;
}

async function musicDownload(videoId, depth = 0) {
  const signatureTimestamp = await getSignatureTimestamp();
  const json = await musicPost('player', {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    playbackContext: { contentPlaybackContext: { signatureTimestamp } }
  });

  const status = json.playabilityStatus?.status;
  if (status !== 'OK') {
    if (depth === 0) {
      const songVideoId = await findSongVideoId(videoId);
      if (songVideoId) {
        const resolved = await musicDownload(songVideoId, 1);
        if (resolved.status === 'OK') {
          return { ...resolved, videoId };
        }
      }
    }
    return {
      videoId,
      status,
      reason: json.playabilityStatus?.reason || null
    };
  }

  const formats = [
    ...(json.streamingData?.formats || []),
    ...(json.streamingData?.adaptiveFormats || [])
  ];

  const audioFormats = formats.filter((f) => f.mimeType?.startsWith('audio'));
  const bestAudio = audioFormats.reduce((best, current) => {
    const bestBitrate = best?.bitrate || 0;
    const currentBitrate = current?.bitrate || 0;
    return currentBitrate > bestBitrate ? current : best;
  }, audioFormats[0]);

  if (!bestAudio) {
    return { videoId, status: 'NO_AUDIO_FORMAT' };
  }

  let downloadUrl = bestAudio.url;
  if (!downloadUrl && (bestAudio.signatureCipher || bestAudio.cipher)) {
    const cipher = bestAudio.signatureCipher || bestAudio.cipher;
    const params = new URLSearchParams(cipher);
    downloadUrl = params.get('url');
  }

  if (!downloadUrl) {
    return { videoId, status: 'NO_DOWNLOAD_URL' };
  }

  return {
    videoId,
    status: 'OK',
    url: downloadUrl,
    title: json.videoDetails?.title,
    artist: json.videoDetails?.author,
    lengthSeconds: Number(json.videoDetails?.lengthSeconds || 0)
  };
}

async function getMusicDownloadUrl(videoId) {
  try {
    const result = await musicDownload(videoId);
    if (result.status === 'OK' && result.url) {
      return result.url;
    }
    return null;
  } catch (error) {
    console.error(`[music] Failed to get download URL for ${videoId}:`, error.message);
    return null;
  }
}

function ytmp3Headers() {
  return {
    'User-Agent': YTMP3_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://id.ytmp3.mobi',
    'Referer': 'https://id.ytmp3.mobi/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };
}

async function ytmp3Scraper(videoId, format = 'mp3') {
  const headers = ytmp3Headers();
  const lowerFormat = format.toLowerCase();

  const initUrl = `https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`;
  const initRes = await fetch(initUrl, { headers });
  if (!initRes.ok) {
    throw new Error(`ytmp3 init failed with status code ${initRes.status}`);
  }
  const initJson = await initRes.json();
  if (initJson.error > 0) {
    throw new Error(`ytmp3 init API returned error: ${initJson.error}`);
  }

  let convertUrl = initJson.convertURL;
  let convertRequestUrl = `${convertUrl}&v=${videoId}&f=${lowerFormat}&_=${Math.random()}`;
  let convertJson;

  while (true) {
    const convertRes = await fetch(convertRequestUrl, { headers });
    if (!convertRes.ok) {
      throw new Error(`ytmp3 convert failed with status code ${convertRes.status}`);
    }
    convertJson = await convertRes.json();
    if (convertJson.error > 0) {
      throw new Error(`ytmp3 convert API returned error: ${convertJson.error}`);
    }

    if (convertJson.redirect > 0 && convertJson.redirectURL) {
      convertRequestUrl = `${convertJson.redirectURL}&v=${videoId}&f=${lowerFormat}&_=${Math.random()}`;
      continue;
    }
    break;
  }

  const progressUrl = convertJson.progressURL;
  const downloadUrl = convertJson.downloadURL;

  if (!progressUrl) {
    throw new Error('ytmp3 conversion response is missing progress URL');
  }

  let progress = 0;
  let pollCount = 0;

  while (progress < 3 && pollCount < YTMP3_MAX_POLLS) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    pollCount++;

    const progressRes = await fetch(progressUrl, { headers });
    if (!progressRes.ok) {
      throw new Error(`ytmp3 progress request failed with status code ${progressRes.status}`);
    }
    const progressJson = await progressRes.json();
    if (progressJson.error > 0) {
      throw new Error(`ytmp3 progress API returned error: ${progressJson.error}`);
    }

    progress = progressJson.progress;
  }

  if (progress < 3) {
    throw new Error('ytmp3 conversion timed out');
  }

  if (!downloadUrl) {
    throw new Error('ytmp3 conversion completed but no downloadUrl was returned');
  }

  return downloadUrl;
}

async function getYtmp3DownloadUrl(videoId) {
  try {
    return await ytmp3Scraper(videoId, 'mp3');
  } catch (error) {
    console.error(`[ytmp3] Failed to get download URL for ${videoId}:`, error.message);
    return null;
  }
}

export async function resolveAudioSource(videoId) {
  let downloadUrl = await savetube(videoId);
  let source = 'savetube';

  if (!downloadUrl) {
    console.error(`[stream] savetube failed for id=${videoId}, trying music.youtube`);
    downloadUrl = await getMusicDownloadUrl(videoId);
    source = 'music.youtube';
  }

  if (!downloadUrl) {
    console.error(`[stream] music.youtube failed for id=${videoId}, trying ytmp3`);
    downloadUrl = await getYtmp3DownloadUrl(videoId);
    source = 'ytmp3';
  }

  if (!downloadUrl) {
    console.error(`[stream] all providers failed for id=${videoId}`);
    return null;
  }

  return { url: downloadUrl, source };
}
