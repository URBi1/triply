import db from '../db/index.js';

export default async function authRoutes(app) {
  app.post('/auth/register', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: 'Name required' });

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(id, name.trim());
    const user = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(id);

    const token = app.jwt.sign({ userId: user.id, name: user.name });
    return { token, user };
  });

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    return db.prepare('SELECT id, name, avatar_url, created_at FROM users WHERE id = ?')
             .get(req.user.userId) ?? null;
  });
}
