import { json } from '@sveltejs/kit';
import { listActiveAnnouncements, getAnnouncementReadIds } from '$lib/server/adminDb.js';

export async function GET({ platform, locals }) {
  const db = platform?.env?.DB;
  if (!db) return json({ announcements: [], unreadCount: 0 });

  const announcements = await listActiveAnnouncements(db);
  const readSet = await getAnnouncementReadIds(db, locals.uid, announcements.map((a) => a.id));
  // isRead per item, bukan cuma agregat unreadCount - popover butuh ini buat
  // nampilin indicator unread per-notif. Nge-mark-semua-jadi-read pas panel
  // dibuka ditangani di client (lihat NotificationBell.svelte), bukan di sini,
  // biar notif baru yang masuk while panel masih kebuka gak ikut ke-mark.
  const withReadState = announcements.map((a) => ({ ...a, isRead: readSet.has(a.id) }));
  const unreadCount = withReadState.filter((a) => !a.isRead).length;

  return json({ announcements: withReadState, unreadCount });
}
