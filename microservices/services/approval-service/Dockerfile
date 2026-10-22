# approval-service – build from THIS folder:  docker build -t qshikshak/approval-service .
# Stage 1: compile TypeScript
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Stage 2: only what is needed to run (no TypeScript, no dev packages, no source)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 5003
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:5003/health || exit 1
CMD ["node", "dist/server.js"]
