// Where the other services live, and the shared token for their /internal routes.
// Laptop: localhost. Docker: docker-compose sets the container names.
export const services = {
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:5001",
  lessonPlan: process.env.LESSON_PLAN_URL || "http://localhost:5002"
};

export const internalToken = process.env.INTERNAL_TOKEN || "";