// Sends each request on to the service that owns its URL (see routes/serviceMap.js).
// The path stays the same: /api/auth/login → http://localhost:5001/api/auth/login
// Plain Node http – the request and the answer are streamed through untouched.
import http from 'node:http';
import { findService } from '../routes/serviceMap.js';

export function forwardToService(req, res, next) {
  const found = findService(req.originalUrl.split('?')[0]);
  if (!found) return next(); // no service owns this URL → 404

  const target = new URL(req.originalUrl, found.url);
  const upstream = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });

  // The service is not running / not reachable / too slow
  upstream.setTimeout(30000, () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (res.headersSent) return res.end();
    res.status(503).json({
      success: false,
      data: null,
      message: `The ${found.name} is not reachable right now. Try again in a moment.`,
    });
  });

  req.pipe(upstream);
}