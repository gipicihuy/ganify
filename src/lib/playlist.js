const _RP_KEY = '_msc_rp';
const _PL_KEY = '_msc_pl';
const _LK_KEY = '_msc_lk';
const _RP_MAX = 30;

export function getLikedSongs() {
  try {
    const r = localStorage.getItem(_LK_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

export function isSongLiked(videoId) {
  return getLikedSongs().some(t => t.videoId === videoId);
}

// Toggle status suka lagu ini, simpan ke localStorage, dan balikin daftar
// terbaru + status suka setelah toggle (dipakai buat sinkronin store).
export function toggleLikeSong(track) {
  let list = getLikedSongs();
  const liked = list.some(t => t.videoId === track.videoId);
  if (liked) {
    list = list.filter(t => t.videoId !== track.videoId);
  } else {
    list = [{ ...track, likedAt: Date.now() }, ...list];
  }
  try { localStorage.setItem(_LK_KEY, JSON.stringify(list)); } catch {}
  return { list, liked: !liked };
}

export function getRecentlyPlayed() {
  try {
    const r = localStorage.getItem(_RP_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

export function addRecentlyPlayed(track) {
  try {
    let list = getRecentlyPlayed();
    list = list.filter(t => t.videoId !== track.videoId);
    list.unshift({ ...track, playedAt: Date.now() });
    if (list.length > _RP_MAX) list = list.slice(0, _RP_MAX);
    localStorage.setItem(_RP_KEY, JSON.stringify(list));
  } catch {}
}

export function removeRecentlyPlayed(videoId) {
  try {
    let list = getRecentlyPlayed();
    list = list.filter(t => t.videoId !== videoId);
    localStorage.setItem(_RP_KEY, JSON.stringify(list));
  } catch {}
}

export function getPlaylists() {
  try {
    const r = localStorage.getItem(_PL_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

function savePlaylists(pls) {
  try { localStorage.setItem(_PL_KEY, JSON.stringify(pls)); } catch {}
}

export function createPlaylist(name) {
  const pls = getPlaylists();
  const pl = { id: `pl_${Date.now()}`, name, tracks: [], createdAt: Date.now() };
  pls.unshift(pl);
  savePlaylists(pls);
  return pl;
}

export function deletePlaylist(id) {
  const pls = getPlaylists().filter(p => p.id !== id);
  savePlaylists(pls);
}

export function addTrackToPlaylist(playlistId, track) {
  const pls = getPlaylists();
  const pl = pls.find(p => p.id === playlistId);
  if (!pl) return false;
  if (pl.tracks.some(t => t.videoId === track.videoId)) return false;
  pl.tracks.unshift(track);
  savePlaylists(pls);
  return true;
}

export function removeTrackFromPlaylist(playlistId, videoId) {
  const pls = getPlaylists();
  const pl = pls.find(p => p.id === playlistId);
  if (!pl) return;
  pl.tracks = pl.tracks.filter(t => t.videoId !== videoId);
  savePlaylists(pls);
}

export function renamePlaylist(id, name) {
  const pls = getPlaylists();
  const pl = pls.find(p => p.id === id);
  if (!pl) return;
  pl.name = name;
  savePlaylists(pls);
}
