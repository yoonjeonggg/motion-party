import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { logger } from './logger.js';
import { registerSocketHandlers } from './socketHandlers.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'socket connected');
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'socket disconnected');
  });
  registerSocketHandlers(io, socket);
});

// Last-resort net: a bug in one room's tick or handler shouldn't take down every
// other room's live match. Per-handler try/catch (see socketHandlers.ts, gameLoop.ts)
// is the primary defense; this just makes sure nothing escapes unlogged.
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection');
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, clientOrigin: CLIENT_ORIGIN }, 'motion-party server listening');
});
