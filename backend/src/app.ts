import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { setPushProvider } from './services/notifications';
import type { PushProvider } from './types/notification';
import { createAdminRouter } from './routes/admin';
import { createAiRouter } from './routes/ai';
import { createAnalyticsRouter } from './routes/analytics';
import { createAuthRouter } from './routes/auth';
import { createCartRouter } from './routes/cart';
import { createCategoriesRouter } from './routes/categories';
import { createChatRouter } from './routes/chat';
import { createNotificationsRouter } from './routes/notifications';
import { createFarmerProfileRouter } from './routes/farmers';
import { createHarvestRecordsRouter } from './routes/harvestRecords';
import { createBuyerMarketplaceRouter } from './routes/marketplace';
import { createMarketRouter } from './routes/market';
import { createDeliveryRouter } from './routes/delivery';
import { createOrdersRouter } from './routes/orders';
import { createEmergencyListingsRouter } from './routes/emergencyListings';
import { createProductBatchesRouter } from './routes/productBatches';
import { createProductsRouter } from './routes/products';
import { createReputationRouter } from './routes/reputation';
import { createReviewsRouter } from './routes/reviews';
import { createWeatherRouter } from './routes/weather';
import { createWishlistRouter } from './routes/wishlist';
import { healthRouter } from './routes/health';

/** Providers are injected only by tests; production always uses the real adapter. */
export type AppOptions = {
  aiTextProvider?: Parameters<typeof createAiRouter>[0];
  cropDiseaseClassifier?: Parameters<typeof createAiRouter>[1];
  /** Push provider is injected only by tests; production uses FCM. */
  pushProvider?: PushProvider;
};

export function createApp(options: AppOptions = {}) {
  if (options.pushProvider) setPushProvider(options.pushProvider);

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
  app.use('/api/harvest-records', createHarvestRecordsRouter());
  app.use('/api/product-batches', createProductBatchesRouter());
  app.use('/api/emergency-listings', createEmergencyListingsRouter());
  app.use('/api/cart', createCartRouter());
  app.use('/api/wishlist', createWishlistRouter());
  app.use('/api/reviews', createReviewsRouter());
  app.use('/api/orders', createOrdersRouter());
  app.use('/api/delivery', createDeliveryRouter());
  app.use('/api/chat', createChatRouter());
  app.use('/api/notifications', createNotificationsRouter());
  app.use('/api/ai', createAiRouter(options.aiTextProvider, options.cropDiseaseClassifier));
  app.use('/api/analytics', createAnalyticsRouter());
  app.use('/api/weather', createWeatherRouter());
  app.use('/api/market', createMarketRouter());
  app.use('/api/reputation', createReputationRouter());
  app.use('/api/admin', createAdminRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
