import { pipeline } from 'stream/promises';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import db from '../db/index.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export default async function photoRoutes(app) {
  const auth = { onRequest: [app.authenticate] };

  app.post('/trips/:tripId/photos', auth, async (req, reply) => {
    const { tripId } = req.params;

    const member = db.prepare(
      'SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?'
    ).get(tripId, req.user.userId);
    if (!member) return reply.code(403).send({ error: 'Not a trip member' });

    const parts = req.parts();
    const saved = [];
    let lat = null, lng = null, taken_at = null;

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'lat') lat = parseFloat(part.value);
        if (part.fieldname === 'lng') lng = parseFloat(part.value);
        if (part.fieldname === 'taken_at') taken_at = part.value;
        continue;
      }
      if (part.type !== 'file') continue;

      const id = crypto.randomUUID();
      const ext = (part.filename.split('.').pop() || 'jpg').toLowerCase();
      const dir = join(UPLOAD_DIR, tripId);
      mkdirSync(dir, { recursive: true });

      const origPath  = join(dir, `${id}.${ext}`);
      const thumbPath = join(dir, `${id}_thumb.jpg`);

      await pipeline(part.file, createWriteStream(origPath));

      try {
        await sharp(origPath).resize(400).jpeg({ quality: 75 }).toFile(thumbPath);
      } catch { /* not an image */ }

      db.prepare(
        `INSERT INTO photos (id, trip_id, user_id, url, thumb_url, lat, lng, taken_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        id, tripId, req.user.userId,
        `/files/${tripId}/${id}.${ext}`,
        `/files/${tripId}/${id}_thumb.jpg`,
        lat, lng, taken_at
      );

      const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
      saved.push(photo);
      app.sse.broadcast(tripId, { type: 'new_photo', photo });
    }

    return reply.code(201).send(saved);
  });

  app.get('/trips/:tripId/photos', auth, async (req, reply) => {
    const { tripId } = req.params;
    const member = db.prepare(
      'SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?'
    ).get(tripId, req.user.userId);
    if (!member) return reply.code(403).send({ error: 'Not a trip member' });

    return db.prepare(`
      SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar,
             COUNT(c.id) AS comment_count
      FROM photos p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN comments c ON c.photo_id = p.id
      WHERE p.trip_id = ?
      GROUP BY p.id
      ORDER BY COALESCE(p.taken_at, p.created_at)
    `).all(tripId);
  });

  app.post('/photos/:photoId/comments', auth, async (req, reply) => {
    const { text } = req.body ?? {};
    if (!text?.trim()) return reply.code(400).send({ error: 'text required' });

    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO comments (id, photo_id, user_id, text) VALUES (?,?,?,?)'
    ).run(id, req.params.photoId, req.user.userId, text.trim());

    const comment = db.prepare(`
      SELECT c.*, u.name AS author_name FROM comments c
      JOIN users u ON u.id = c.user_id WHERE c.id = ?
    `).get(id);

    app.sse.broadcast(req.params.photoId, { type: 'new_comment', comment });
    return reply.code(201).send(comment);
  });

  app.get('/photos/:photoId/comments', auth, async (req) => {
    return db.prepare(`
      SELECT c.*, u.name AS author_name, u.avatar_url AS author_avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.photo_id = ? ORDER BY c.created_at
    `).all(req.params.photoId);
  });
}
