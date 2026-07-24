import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { realtime } from './realtime/realtime';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[cafeos-backend] listening on http://localhost:${PORT}`);
  console.log(`[cafeos-backend] WebSocket realtime on ws://localhost:${PORT}/ws`);
});

// Pasang WebSocket realtime pada HTTP server yang sama.
realtime.init(server);

// Matikan koneksi dengan rapi saat proses dihentikan (PM2 restart / SIGTERM).
async function shutdown(signal: string) {
  console.log(`[cafeos-backend] ${signal} received, shutting down…`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
