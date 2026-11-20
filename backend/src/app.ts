import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { createAnalyticsRouter } from './routes/analytics';
import { createAuthRouter } from './routes/auth';
import { createMarketRouter } from './routes/market';
import { createOrdersRouter } from './routes/orders';
import { createProductsRouter } from './routes/products';
import { createWeatherRouter } from './routes/weather';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/products', createProductsRouter());
  app.use('/api/orders', createOrdersRouter());
  app.use('/api/analytics', createAnalyticsRouter());
  app.use('/api/weather', createWeatherRouter());
  app.use('/api/market', createMarketRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
