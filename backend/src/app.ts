import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { createAuthRouter } from './routes/auth';
import { createProductsRouter } from './routes/products';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/products', createProductsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
