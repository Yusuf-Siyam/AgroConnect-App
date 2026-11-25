import { Router } from 'express';

import { photoAdviceStatus } from '../config/photoAdvice';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    // Safe operational flags only: no key, model ID image or prompt is exposed.
    ai: photoAdviceStatus(),
  });
});
