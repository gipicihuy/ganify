const MAINTENANCE_KEY = 'maintenance_mode';

// ---------------- maintenance mode (app_settings) ----------------

export async function getMaintenanceMode(db) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(MAINTENANCE_KEY).first();
  if (!row) return { enabled: false, message: '' };
  try {
    return JSON.parse(row.value);
  } catch {
    return { enabled: false, message: '' };
  }
}

export async function setMaintenanceMode(db, enabled, message, adminEmail) {
  const value = JSON.stringify({ enabled: !!enabled, message: String(message || '').slice(0, 300) });
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(MAINTENANCE_KEY, value, Date.now(), adminEmail)
    .run();
}

// ---------------- feature flags ----------------
// Reuses app_settings with a "flag:" key prefix. Nothing in the product
// currently reads these yet — no existing route in this repo is gated
// behind a flag — so this just gives admins a durable on/off switch they
// can wire specific features into later without another migration.

export async function listFeatureFlags(db) {
  const rows = await db.prepare("SELECT key, value, updated_at FROM app_settings WHERE key LIKE 'flag:%' ORDER BY key").all();
  return rows.results.map((r) => ({ key: r.key.slice('flag:'.length), enabled: r.value === '1', updatedAt: r.updated_at }));
}

export async function setFeatureFlag(db, key, enabled, adminEmail) {
  const safeKey = `flag:${String(key).trim().slice(0, 60)}`;
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(safeKey, enabled ? '1' : '0', Date.now(), adminEmail)
    .run();
  await logAdminAction(db, adminEmail, enabled ? 'enable_flag' : 'disable_flag', key, null);
}

export async function deleteFeatureFlag(db, key, adminEmail) {
  await db.prepare('DELETE FROM app_settings WHERE key = ?').bind(`flag:${key}`).run();
  await logAdminAction(db, adminEmail, 'delete_flag', key, null);
}

// ---------------- overview ----------------

export async function getOverviewStats(db) {
  const [totalUsers, registeredUsers, bannedUsers, activeAnnouncements] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM users').first(),
    db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_guest = 0').first(),
    db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_banned = 1').first(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM announcements WHERE is_active = 1
         AND (publish_at IS NULL OR publish_at <= ?) AND (expires_at IS NULL OR expires_at > ?)`
      )
      .bind(Date.now(), Date.now())
      .first()
  ]);
  return {
    totalUsers: totalUsers?.c || 0,
    registeredUsers: registeredUsers?.c || 0,
    bannedUsers: bannedUsers?.c || 0,
    activeAnnouncements: activeAnnouncements?.c || 0
  };
}

// ---------------- users ----------------

export async function listUsers(db, { search = '', limit = 50, offset = 0 } = {}) {
  const like = `%${search.trim()}%`;
  const where = search.trim()
    ? 'WHERE (name LIKE ? OR email LIKE ?) AND is_guest = 0'
    : 'WHERE is_guest = 0';
  const params = search.trim() ? [like, like] : [];

  const rows = await db
    .prepare(
      `SELECT id, email, name, avatar_url, is_banned, banned_reason, created_at, last_seen_at
       FROM users ${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all();

  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM users ${where}`)
    .bind(...params)
    .first();

  return { users: rows.results, total: total?.c || 0 };
}

export async function setUserBanned(db, userId, banned, reason, adminEmail) {
  await db
    .prepare('UPDATE users SET is_banned = ?, banned_at = ?, banned_reason = ? WHERE id = ?')
    .bind(banned ? 1 : 0, banned ? Date.now() : null, banned ? String(reason || '').slice(0, 200) : null, userId)
    .run();
  await logAdminAction(db, adminEmail, banned ? 'ban_user' : 'unban_user', userId, reason || null);
}

// ---------------- announcements ----------------

export async function listAnnouncementsAdmin(db) {
  const rows = await db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  return rows.results;
}

export async function listActiveAnnouncements(db) {
  const now = Date.now();
  const rows = await db
    .prepare(
      `SELECT id, title, body, publish_at, expires_at, created_at FROM announcements
       WHERE is_active = 1 AND (publish_at IS NULL OR publish_at <= ?) AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 20`
    )
    .bind(now, now)
    .all();
  return rows.results;
}

export async function createAnnouncement(db, { title, body, isActive, publishAt, expiresAt }, adminEmail) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO announcements (id, title, body, is_active, publish_at, expires_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, String(title).slice(0, 120), String(body).slice(0, 2000), isActive ? 1 : 0, publishAt || null, expiresAt || null, Date.now(), adminEmail)
    .run();
  await logAdminAction(db, adminEmail, 'create_announcement', id, title);
  return id;
}

export async function updateAnnouncement(db, id, { title, body, isActive, publishAt, expiresAt }, adminEmail) {
  await db
    .prepare(
      `UPDATE announcements SET title = ?, body = ?, is_active = ?, publish_at = ?, expires_at = ? WHERE id = ?`
    )
    .bind(String(title).slice(0, 120), String(body).slice(0, 2000), isActive ? 1 : 0, publishAt || null, expiresAt || null, id)
    .run();
  await logAdminAction(db, adminEmail, 'update_announcement', id, title);
}

export async function deleteAnnouncement(db, id, adminEmail) {
  await db.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  await logAdminAction(db, adminEmail, 'delete_announcement', id, null);
}

// Dipakai bareng oleh GET /api/announcements (buat nandain tiap notif
// individual sudah dibaca/belum) dan getUnreadAnnouncementCount di bawah -
// satu query read-state ini dishare, bukan di-duplikasi.
export async function getAnnouncementReadIds(db, userId, ids) {
  if (!ids.length) return new Set();
  const placeholders = ids.map(() => '?').join(',');
  const readRows = await db
    .prepare(`SELECT announcement_id FROM announcement_reads WHERE user_id = ? AND announcement_id IN (${placeholders})`)
    .bind(userId, ...ids)
    .all();
  return new Set(readRows.results.map((r) => r.announcement_id));
}

export async function getUnreadAnnouncementCount(db, userId) {
  const active = await listActiveAnnouncements(db);
  if (!active.length) return 0;
  const readSet = await getAnnouncementReadIds(db, userId, active.map((a) => a.id));
  return active.filter((a) => !readSet.has(a.id)).length;
}

export async function markAnnouncementRead(db, userId, announcementId) {
  await db
    .prepare(
      `INSERT INTO announcement_reads (user_id, announcement_id, read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, announcement_id) DO UPDATE SET read_at = excluded.read_at`
    )
    .bind(userId, announcementId, Date.now())
    .run();
}

// ---------------- audit log ----------------

export async function logAdminAction(db, actorEmail, action, target, detail) {
  await db
    .prepare('INSERT INTO admin_audit_log (actor_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(actorEmail, action, target || null, detail ? String(detail).slice(0, 300) : null, Date.now())
    .run();
}

export async function listAuditLog(db, { limit = 50, offset = 0 } = {}) {
  const rows = await db
    .prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all();
  const total = await db.prepare('SELECT COUNT(*) AS c FROM admin_audit_log').first();
  return { entries: rows.results, total: total?.c || 0 };
}
