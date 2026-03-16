import db from '../db/index.js';

export default async function tripRoutes(app) {
  const auth = { onRequest: [app.authenticate] };

  app.post('/trips', auth, async (req, reply) => {
    const { name, start_date, end_date } = req.body ?? {};
    if (!name || !start_date || !end_date)
      return reply.code(400).send({ error: 'name, start_date, end_date required' });

    const id = crypto.randomUUID();
    const invite_code = crypto.randomUUID().slice(0, 8);

    db.prepare(
      'INSERT INTO trips (id, name, start_date, end_date, invite_code, created_by) VALUES (?,?,?,?,?,?)'
    ).run(id, name, start_date, end_date, invite_code, req.user.userId);

    // Creator auto-joins
    db.prepare('INSERT INTO trip_members (trip_id, user_id) VALUES (?,?)').run(id, req.user.userId);

    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
    return reply.code(201).send(trip);
  });

  app.get('/trips', auth, async (req) => {
    return db.prepare(`
      SELECT t.*, COUNT(DISTINCT p.id) AS photo_count, COUNT(DISTINCT m.user_id) AS member_count
      FROM trips t
      JOIN trip_members m ON m.trip_id = t.id
      LEFT JOIN photos p ON p.trip_id = t.id
      WHERE m.user_id = ?
      GROUP BY t.id
      ORDER BY t.start_date DESC
    `).all(req.user.userId);
  });

  app.get('/trips/:id', auth, async (req, reply) => {
    const trip = db.prepare(`
      SELECT t.*, COUNT(DISTINCT p.id) AS photo_count
      FROM trips t
      JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
      LEFT JOIN photos p ON p.trip_id = t.id
      WHERE t.id = ?
      GROUP BY t.id
    `).get(req.user.userId, req.params.id);
    if (!trip) return reply.code(404).send({ error: 'Trip not found' });
    return trip;
  });

  app.post('/trips/join/:code', auth, async (req, reply) => {
    const trip = db.prepare('SELECT * FROM trips WHERE invite_code = ?').get(req.params.code);
    if (!trip) return reply.code(404).send({ error: 'Invalid invite code' });

    db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id) VALUES (?,?)')
      .run(trip.id, req.user.userId);
    return trip;
  });

  app.get('/trips/:id/members', auth, async (req) => {
    return db.prepare(`
      SELECT u.id, u.name, u.avatar_url, m.joined_at
      FROM trip_members m JOIN users u ON u.id = m.user_id
      WHERE m.trip_id = ?
    `).all(req.params.id);
  });
}
