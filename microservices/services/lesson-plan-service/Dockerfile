
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

# Ensure the non-root user can access application files
RUN chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=5002

EXPOSE 5002

# Run the application as a non-root user
USER node

# Check that the service and MongoDB are healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5002/health || exit 1

CMD ["npm", "start"]
