import { json } from '@sveltejs/kit';
import { listActiveAnnouncements, getUnreadAnnouncementCount } from '$lib/server/adminDb.js';

export async function GET({ platform, locals }) {
  const db = platform?.env?.DB;
  if (!db) return json({ announcements: [], unreadCount: 0 });

  const [announcements, unreadCount] = await Promise.all([
    listActiveAnnouncements(db),
    getUnreadAnnouncementCount(db, locals.uid)
  ]);

  return json({ announcements, unreadCount });
}
