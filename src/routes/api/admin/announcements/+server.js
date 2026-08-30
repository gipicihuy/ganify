import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { listAnnouncementsAdmin, createAnnouncement } from '$lib/server/adminDb.js';

export async function GET(event) {
  await requireAdmin(event);
  const db = event.platform.env.DB;
  const list = await listAnnouncementsAdmin(db);
  return json({ announcements: list });
}

export async function POST(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const body = await event.request.json().catch(() => ({}));
  if (!body.title || !body.body) throw error(400, 'title and body are required');

  const id = await createAnnouncement(
    db,
    {
      title: body.title,
      body: body.body,
      isActive: body.isActive !== false,
      publishAt: body.publishAt ? Number(body.publishAt) : null,
      expiresAt: body.expiresAt ? Number(body.expiresAt) : null
    },
    admin.email
  );
  return json({ ok: true, id });
}
