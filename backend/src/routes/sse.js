// Server-Sent Events — real-time updates for trip album
const clients = new Map(); // roomId → Set<reply>

export function ssePlugin(app) {
  // Attach broadcaster to app instance
  app.decorate('sse', {
    broadcast(roomId, data) {
      const room = clients.get(roomId);
      if (!room) return;
      const msg = `data: ${JSON.stringify(data)}\n\n`;
      for (const reply of room) {
        try { reply.raw.write(msg); } catch { room.delete(reply); }
      }
    }
  });

  app.get('/trips/:tripId/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { tripId } = req.params;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.write(':\n\n'); // comment to open connection

    if (!clients.has(tripId)) clients.set(tripId, new Set());
    clients.get(tripId).add(reply);

    // Heartbeat every 20s
    const hb = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); }
      catch { clearInterval(hb); }
    }, 20000);

    req.raw.on('close', () => {
      clearInterval(hb);
      clients.get(tripId)?.delete(reply);
    });

    // Keep connection open
    await new Promise(() => {});
  });
}
