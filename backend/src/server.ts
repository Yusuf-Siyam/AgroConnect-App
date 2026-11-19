import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[agroconnect-backend] listening on port ${env.port}`);
});

function shutdown(signal: string): void {
  server.close(() => {
    console.log(`[agroconnect-backend] stopped by ${signal}`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
