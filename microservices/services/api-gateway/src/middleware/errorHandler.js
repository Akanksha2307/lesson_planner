// Same { success, data, message } answers as the services
import { config } from '../config/index.js';

export const notFoundRoute = (req, res) =>
  res.status(404).json({ success: false, data: null, message: `No API route for ${req.method} ${req.originalUrl}` });

// /internal/... is only for services talking to each other – never from outside
export const blockInternal = (req, res) => res.status(404).json({ success: false, data: null, message: 'Not found.' });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(`[${config.serviceName}]`, err);
  res.status(500).json({ success: false, data: null, message: 'Something went wrong in the gateway.' });
}