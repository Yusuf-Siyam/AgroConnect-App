import { createApp } from './app';
import { env } from './config/env';
import { photoAdviceStatus } from './config/photoAdvice';

// Log safe flags so a stale process or wrong .env is obvious at startup.
const aiStatus = photoAdviceStatus();
console.log('[agroconnect-backend] AI config', {
  diseaseProvider: aiStatus.provider,
  photoAdviceConfigured: aiStatus.photoAdviceConfigured,
  geminiKeyPresent: aiStatus.geminiApiKeyPresent,
  geminiVisionModelPresent: aiStatus.geminiVisionModelPresent,
});

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
