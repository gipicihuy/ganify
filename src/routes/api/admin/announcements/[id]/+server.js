import { json, error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin.js';
import { updateAnnouncement, deleteAnnouncement } from '$lib/server/adminDb.js';

export async function PUT(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  const body = await event.request.json().catch(() => ({}));
  if (!body.title || !body.body) throw error(400, 'title and body are required');

  await updateAnnouncement(
    db,
    event.params.id,
    {
      title: body.title,
      body: body.body,
      isActive: body.isActive !== false,
      publishAt: body.publishAt ? Number(body.publishAt) : null,
      expiresAt: body.expiresAt ? Number(body.expiresAt) : null
    },
    admin.email
  );
  return json({ ok: true });
}

export async function DELETE(event) {
  const admin = await requireAdmin(event);
  const db = event.platform.env.DB;
  await deleteAnnouncement(db, event.params.id, admin.email);
  return json({ ok: true });
}
