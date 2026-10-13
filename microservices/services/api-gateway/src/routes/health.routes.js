// GET /api/health – is the gateway up, and which services answer?
import { Router } from 'express';
import { config } from '../config/index.js';
import { NAMES } from './serviceMap.js';

const router = Router();

async function check(name, url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return { service: name, url, status: res.ok ? 'up' : 'down', db: body?.data?.db };
  } catch {
    return { service: name, url, status: 'down' };
  }
}

router.get('/api/health', async (req, res) => {
  const services = await Promise.all(Object.entries(config.services).map(([key, url]) => check(NAMES[key], url)));
  const allUp = services.every((s) => s.status === 'up');
  res.status(allUp ? 200 : 503).json({
    success: allUp,
    data: { gateway: 'up', services },
    message: allUp ? 'All services are up' : 'Some services are down',
  });
});

export default router;