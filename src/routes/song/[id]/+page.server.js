import { error } from '@sveltejs/kit';
import { fetchTrackMeta } from '$lib/server/songMeta.js';

export async function load({ params, url }) {
  const id = params.id;
  let track = null;

  try {
    track = await fetchTrackMeta(id);
  } catch (e) {
    track = null;
  }

  if (!track) throw error(404, 'Lagu tidak ditemukan');

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
    shareUrl: `${url.origin}/song/${id}`
  };
}
