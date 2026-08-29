const HISTORY_LIMIT = 30;
const BIND_PROMPT_PLAY_THRESHOLD = 5;
const BIND_PROMPT_DAYS_THRESHOLD = 3;
const BIND_PROMPT_SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

export async function getUserByGoogleId(db, googleId) {
  return db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();
}

export async function ensureUser(db, id) {
  const existing = await getUserById(db, id);
  if (existing) {
    const now = Date.now();
    await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, id).run();
    return existing;
  }
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO users (id, is_guest, song_play_count, created_at, last_seen_at) VALUES (?, 1, 0, ?, ?)'
    )
    .bind(id, now, now)
    .run();
  return getUserById(db, id);
}

export async function incrementPlayCount(db, id) {
  await db
    .prepare('UPDATE users SET song_play_count = song_play_count + 1 WHERE id = ?')
    .bind(id)
    .run();
}

export async function getBindPromptState(db, id) {
  const user = await getUserById(db, id);
  if (!user || !user.is_guest) return { shouldPrompt: false };
  const now = Date.now();
  if (user.bind_dismissed_until && user.bind_dismissed_until > now) {
    return { shouldPrompt: false };
  }
  const playlistCount = await db
    .prepare('SELECT COUNT(*) AS c FROM playlists WHERE user_id = ?')
    .bind(id)
    .first();
  const daysActive = (now - user.created_at) / DAY_MS;
  const reachedActivity =
    user.song_play_count >= BIND_PROMPT_PLAY_THRESHOLD || (playlistCount?.c || 0) >= 1;
  const reachedTime = daysActive >= BIND_PROMPT_DAYS_THRESHOLD;
  if (reachedActivity || reachedTime) {
    return { shouldPrompt: true, reason: reachedActivity ? 'activity' : 'time' };
  }
  return { shouldPrompt: false };
}

export async function dismissBindPrompt(db, id) {
  const until = Date.now() + BIND_PROMPT_SNOOZE_DAYS * DAY_MS;
  await db.prepare('UPDATE users SET bind_dismissed_until = ? WHERE id = ?').bind(until, id).run();
}

export async function linkGoogleAccount(db, guestId, googleId, profile) {
  const existing = await getUserByGoogleId(db, googleId);
  const now = Date.now();

  if (!existing) {
    await db
      .prepare(
        'UPDATE users SET google_id = ?, email = ?, name = ?, avatar_url = ?, is_guest = 0, last_seen_at = ? WHERE id = ?'
      )
      .bind(googleId, profile.email || null, profile.name || null, profile.image || null, now, guestId)
      .run();
    return guestId;
  }

  if (existing.id === guestId) {
    return guestId;
  }

  await mergeGuestIntoAccount(db, guestId, existing.id);

  await db
    .prepare(
      'UPDATE users SET email = ?, name = ?, avatar_url = ?, last_seen_at = ? WHERE id = ?'
    )
    .bind(profile.email || existing.email, profile.name || existing.name, profile.image || existing.avatar_url, now, existing.id)
    .run();

  return existing.id;
}

async function mergeGuestIntoAccount(db, fromId, toId) {
  const [fromLiked, toLiked] = await Promise.all([
    db.prepare('SELECT video_id, track_data, liked_at FROM liked_songs WHERE user_id = ?').bind(fromId).all(),
    db.prepare('SELECT video_id, track_data, liked_at FROM liked_songs WHERE user_id = ?').bind(toId).all()
  ]);
  const likedMap = new Map();
  for (const row of toLiked.results) likedMap.set(row.video_id, row);
  for (const row of fromLiked.results) {
    const current = likedMap.get(row.video_id);
    if (!current || row.liked_at > current.liked_at) likedMap.set(row.video_id, row);
  }
  await db.prepare('DELETE FROM liked_songs WHERE user_id = ?').bind(toId).run();
  await db.prepare('DELETE FROM liked_songs WHERE user_id = ?').bind(fromId).run();
  const likedInserts = [...likedMap.values()].map((row) =>
    db
      .prepare('INSERT INTO liked_songs (user_id, video_id, track_data, liked_at) VALUES (?, ?, ?, ?)')
      .bind(toId, row.video_id, row.track_data, row.liked_at)
  );
  if (likedInserts.length) await db.batch(likedInserts);

  const [fromHistory, toHistory] = await Promise.all([
    db.prepare('SELECT video_id, track_data, played_at FROM history WHERE user_id = ?').bind(fromId).all(),
    db.prepare('SELECT video_id, track_data, played_at FROM history WHERE user_id = ?').bind(toId).all()
  ]);
  const merged = [...toHistory.results, ...fromHistory.results]
    .sort((a, b) => b.played_at - a.played_at)
    .slice(0, HISTORY_LIMIT);
  await db.prepare('DELETE FROM history WHERE user_id = ?').bind(toId).run();
  await db.prepare('DELETE FROM history WHERE user_id = ?').bind(fromId).run();
  const historyInserts = merged.map((row) =>
    db
      .prepare('INSERT INTO history (user_id, video_id, track_data, played_at) VALUES (?, ?, ?, ?)')
      .bind(toId, row.video_id, row.track_data, row.played_at)
  );
  if (historyInserts.length) await db.batch(historyInserts);

  const [fromPlaylists, toPlaylists] = await Promise.all([
    db.prepare('SELECT * FROM playlists WHERE user_id = ?').bind(fromId).all(),
    db.prepare('SELECT name FROM playlists WHERE user_id = ?').bind(toId).all()
  ]);
  const existingNames = new Set(toPlaylists.results.map((p) => p.name));
  for (const pl of fromPlaylists.results) {
    let name = pl.name;
    let suffix = 2;
    while (existingNames.has(name)) {
      name = `${pl.name} (${suffix})`;
      suffix += 1;
    }
    existingNames.add(name);
    await db.prepare('UPDATE playlists SET user_id = ?, name = ? WHERE id = ?').bind(toId, name, pl.id).run();
  }

  await db.prepare('DELETE FROM users WHERE id = ?').bind(fromId).run();
}

export async function listLikedSongs(db, userId) {
  const r = await db
    .prepare('SELECT video_id, track_data, liked_at FROM liked_songs WHERE user_id = ? ORDER BY liked_at DESC')
    .bind(userId)
    .all();
  return r.results.map((row) => ({ ...JSON.parse(row.track_data), likedAt: row.liked_at }));
}

export async function toggleLikedSong(db, userId, track) {
  const existing = await db
    .prepare('SELECT id FROM liked_songs WHERE user_id = ? AND video_id = ?')
    .bind(userId, track.videoId)
    .first();
  if (existing) {
    await db.prepare('DELETE FROM liked_songs WHERE id = ?').bind(existing.id).run();
    return { liked: false };
  }
  await db
    .prepare('INSERT INTO liked_songs (user_id, video_id, track_data, liked_at) VALUES (?, ?, ?, ?)')
    .bind(userId, track.videoId, JSON.stringify(track), Date.now())
    .run();
  return { liked: true };
}

export async function listHistory(db, userId) {
  const r = await db
    .prepare('SELECT video_id, track_data, played_at FROM history WHERE user_id = ? ORDER BY played_at DESC')
    .bind(userId)
    .all();
  return r.results.map((row) => ({ ...JSON.parse(row.track_data), playedAt: row.played_at }));
}

export async function addHistory(db, userId, track) {
  await db.prepare('DELETE FROM history WHERE user_id = ? AND video_id = ?').bind(userId, track.videoId).run();
  await db
    .prepare('INSERT INTO history (user_id, video_id, track_data, played_at) VALUES (?, ?, ?, ?)')
    .bind(userId, track.videoId, JSON.stringify(track), Date.now())
    .run();
  const excess = await db
    .prepare('SELECT id FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT -1 OFFSET ?')
    .bind(userId, HISTORY_LIMIT)
    .all();
  if (excess.results.length) {
    const deletes = excess.results.map((row) => db.prepare('DELETE FROM history WHERE id = ?').bind(row.id));
    await db.batch(deletes);
  }
  await incrementPlayCount(db, userId);
}

export async function removeHistory(db, userId, videoId) {
  await db.prepare('DELETE FROM history WHERE user_id = ? AND video_id = ?').bind(userId, videoId).run();
}

export async function listPlaylists(db, userId) {
  const playlists = await db
    .prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all();
  const result = [];
  for (const pl of playlists.results) {
    const tracks = await db
      .prepare('SELECT video_id, track_data FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at DESC')
      .bind(pl.id)
      .all();
    result.push({
      id: pl.id,
      name: pl.name,
      createdAt: pl.created_at,
      tracks: tracks.results.map((row) => JSON.parse(row.track_data))
    });
  }
  return result;
}

export async function createPlaylist(db, userId, name) {
  const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  await db
    .prepare('INSERT INTO playlists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, name, createdAt)
    .run();
  return { id, name, createdAt, tracks: [] };
}

export async function deletePlaylist(db, userId, id) {
  await db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?').bind(id, userId).run();
}

export async function renamePlaylist(db, userId, id, name) {
  await db.prepare('UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?').bind(name, id, userId).run();
}

export async function addTrackToPlaylist(db, userId, playlistId, track) {
  const owns = await db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .bind(playlistId, userId)
    .first();
  if (!owns) return false;
  const existing = await db
    .prepare('SELECT id FROM playlist_tracks WHERE playlist_id = ? AND video_id = ?')
    .bind(playlistId, track.videoId)
    .first();
  if (existing) return false;
  await db
    .prepare('INSERT INTO playlist_tracks (playlist_id, video_id, track_data, added_at) VALUES (?, ?, ?, ?)')
    .bind(playlistId, track.videoId, JSON.stringify(track), Date.now())
    .run();
  return true;
}

export async function removeTrackFromPlaylist(db, userId, playlistId, videoId) {
  const owns = await db
    .prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .bind(playlistId, userId)
    .first();
  if (!owns) return;
  await db
    .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND video_id = ?')
    .bind(playlistId, videoId)
    .run();
}
