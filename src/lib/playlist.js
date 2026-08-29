async function _req(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`request failed: ${url}`);
  return res.json();
}

function _jsonInit(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

export async function getLikedSongs() {
  const data = await _req('/api/liked');
  return data.list || [];
}

export async function toggleLikeSong(track) {
  const data = await _req('/api/liked', _jsonInit('POST', track));
  return { list: data.list || [], liked: !!data.liked };
}

export async function getRecentlyPlayed() {
  const data = await _req('/api/history');
  return data.list || [];
}

export async function addRecentlyPlayed(track) {
  await _req('/api/history', _jsonInit('POST', track));
}

export async function removeRecentlyPlayed(videoId) {
  await _req('/api/history', _jsonInit('DELETE', { videoId }));
}

export async function getPlaylists() {
  const data = await _req('/api/playlists');
  return data.list || [];
}

export async function createPlaylist(name) {
  const data = await _req('/api/playlists', _jsonInit('POST', { name }));
  return data.playlist;
}

export async function deletePlaylist(id) {
  await _req(`/api/playlists/${id}`, { method: 'DELETE' });
}

export async function renamePlaylist(id, name) {
  await _req(`/api/playlists/${id}`, _jsonInit('PATCH', { name }));
}

export async function addTrackToPlaylist(playlistId, track) {
  const data = await _req(`/api/playlists/${playlistId}/tracks`, _jsonInit('POST', track));
  return !!data.added;
}

export async function removeTrackFromPlaylist(playlistId, videoId) {
  await _req(`/api/playlists/${playlistId}/tracks`, _jsonInit('DELETE', { videoId }));
}
