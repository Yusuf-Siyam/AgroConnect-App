import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { createAnalyticsRouter } from './routes/analytics';
import { createAuthRouter } from './routes/auth';
import { createCartRouter } from './routes/cart';
import { createCategoriesRouter } from './routes/categories';
import { createFarmerProfileRouter } from './routes/farmers';
import { createBuyerMarketplaceRouter } from './routes/marketplace';
import { createMarketRouter } from './routes/market';
import { createOrdersRouter } from './routes/orders';
import { createProductsRouter } from './routes/products';
import { createReviewsRouter } from './routes/reviews';
import { createWeatherRouter } from './routes/weather';
import { createWishlistRouter } from './routes/wishlist';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins.length > 0 ? env.corsOrigins : false }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/products', createProductsRouter());
  app.use('/api/marketplace', createBuyerMarketplaceRouter());
  app.use('/api/categories', createCategoriesRouter());
  app.use('/api/farmers', createFarmerProfileRouter());
  app.use('/api/cart', createCartRouter());
  app.use('/api/wishlist', createWishlistRouter());
  app.use('/api/reviews', createReviewsRouter());
  app.use('/api/orders', createOrdersRouter());
  app.use('/api/analytics', createAnalyticsRouter());
  app.use('/api/weather', createWeatherRouter());
  app.use('/api/market', createMarketRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
