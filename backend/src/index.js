import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { join, resolve } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import photoRoutes from './routes/photos.js';
import { ssePlugin } from './routes/sse.js';
import db from './db/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(__dir, '../../uploads'));
mkdirSync(UPLOAD_DIR, { recursive: true });

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev_secret' });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

await app.register(staticFiles, {
  root: UPLOAD_DIR,
  prefix: '/files/',
});

// Auth decorator — verifies JWT and checks user still exists in DB
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

ssePlugin(app);

await app.register(authRoutes);
await app.register(tripRoutes);
await app.register(photoRoutes);

app.get('/health', () => ({ status: 'ok' }));

try {
  const port = parseInt(process.env.PORT || '3001');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Triply API running on http://0.0.0.0:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
