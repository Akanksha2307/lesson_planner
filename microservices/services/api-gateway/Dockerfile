# api-gateway – build from THIS folder:  docker build -t qshikshak/api-gateway .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://localhost:5000/health || exit 1
CMD ["node", "src/server.js"]