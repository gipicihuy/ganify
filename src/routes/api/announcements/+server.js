import { json } from '@sveltejs/kit';
import { listActiveAnnouncements, getAnnouncementReadIds } from '$lib/server/adminDb.js';

export async function GET({ platform, locals }) {
  const db = platform?.env?.DB;
  if (!db) return json({ announcements: [], unreadCount: 0 });

  const announcements = await listActiveAnnouncements(db);
  const readSet = await getAnnouncementReadIds(db, locals.uid, announcements.map((a) => a.id));
  // isRead per item, bukan cuma agregat unreadCount - popover butuh ini biar
  // bisa nampilin indicator unread per-notif dan nandain baca satu-satu pas
  // diklik, bukan nge-mark semuanya sekaligus pas popover dibuka.
  const withReadState = announcements.map((a) => ({ ...a, isRead: readSet.has(a.id) }));
  const unreadCount = withReadState.filter((a) => !a.isRead).length;

  return json({ announcements: withReadState, unreadCount });
}
