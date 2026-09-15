import { error, redirect } from '@sveltejs/kit';
import { fetchTrackMetaLight } from '$lib/server/songMeta.js';

// Dipakai buat bedain "crawler" pembuat preview (WhatsApp, Telegram, FB,
// Twitter/X, Discord, Slack, LinkedIn, mesin pencari, dll) dari browser
// asli. Regex catch-all "bot|crawler|spider|preview" di akhir jaga-jaga
// kalau ada crawler lain yang belum kesebut eksplisit di atas.
const CRAWLER_UA_RE =
  /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|discordbot|slackbot|linkedinbot|pinterest|redditbot|vkshare|skypeuripreview|line-poker|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|embedly|quora link preview|w3c_validator|bot|crawler|spider|preview/i;

// Thumbnail YT Music (googleusercontent/ggpht) selalu diakhiri parameter
// ukuran, mis. "...=w120-h120-l90-rj" - kita ganti jadi ukuran gede persegi
// biar preview WhatsApp nampilin cover kayak artwork album, bukan thumbnail
// kecil. Fallback video biasa (i.ytimg.com) dikasih dimensi sesuai nama
// filenya sendiri, karena itu ukuran tetap yang YouTube sediakan.
function toLargeOgImage(rawUrl) {
  const fallback = { url: rawUrl, width: 0, height: 0 };
  if (!rawUrl) return fallback;

  if (rawUrl.includes('googleusercontent.com') || rawUrl.includes('ggpht.com')) {
    const big = rawUrl.replace(/=w\d+-h\d+(-[a-z0-9]+)*$/i, '=w720-h720-l90-rj');
    return big !== rawUrl ? { url: big, width: 720, height: 720 } : fallback;
  }
  if (rawUrl.includes('maxresdefault')) return { url: rawUrl, width: 1280, height: 720 };
  if (rawUrl.includes('sddefault')) return { url: rawUrl, width: 640, height: 480 };
  if (rawUrl.includes('hqdefault')) return { url: rawUrl, width: 480, height: 360 };
  return fallback;
}

export async function load({ params, url, request, setHeaders }) {
  const id = params.id;
  const ua = request.headers.get('user-agent') || '';
  const isCrawler = CRAWLER_UA_RE.test(ua);

  // Browser asli: langsung redirect ke Home tanpa nunggu fetch metadata
  // sama sekali - itu yang bikin klik link share kerasa lemot sebelumnya.
  // Home yang bakal ambil data lagunya (lewat /api/song/preview, versi
  // ringan) buat isi bottom sheet "Seseorang membagikan lagu ini kepadamu".
  if (!isCrawler) {
    throw redirect(302, `/?share=${encodeURIComponent(id)}`);
  }

  // Crawler: render halaman ini apa adanya cuma buat nyediain meta tag
  // og:/twitter: secepat mungkin - pakai fetch ringan (bukan fetchTrackMeta
  // yang juga narik & resolve seluruh antrian up-next, gak kepake di sini).
  let track = null;
  try {
    track = await fetchTrackMetaLight(id);
  } catch (e) {
    track = null;
  }

  if (!track) throw error(404, 'Lagu tidak ditemukan');

  // Cache respons di edge Cloudflare 10 menit - link yang lagi rame
  // dibagikan (mis. lagi viral) gak perlu nembak YT Music berkali-kali
  // buat request crawler yang datang beruntun.
  setHeaders({ 'Cache-Control': 'public, max-age=600' });

  const ogImage = toLargeOgImage(track.thumbnail);

  return {
    track: {
      videoId: track.videoId,
      title: track.title,
      thumbnail: track.thumbnail,
      artist: track.artist,
      author: track.author,
      duration: track.duration,
      artistId: track.artistId
    },
    ogImage,
    shareUrl: `${url.origin}/song/${id}`
  };
}
