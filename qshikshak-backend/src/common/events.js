// A tiny in-process event bus. One module announces something happened ("plan.submitted"),
// other modules (notifications) react to it – without the two calling each other.
// When the backend is split into microservices, this becomes a message queue (e.g. RabbitMQ).
import { EventEmitter } from 'node:events';

export const events = new EventEmitter();

// Listeners must never crash the request that raised the event
export function publish(name, payload) {
  for (const listener of events.listeners(name)) {
    Promise.resolve()
      .then(() => listener(payload))
      .catch((err) => console.error(`Event "${name}" listener failed:`, err.message));
  }
}

export const subscribe = (name, listener) => events.on(name, listener);