# auth-service – build from THIS folder:  docker build -t qshikshak/auth-service .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# 1. Packages first – Docker reuses this step until package.json changes (faster rebuilds)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2. Then the code (.dockerignore keeps node_modules and .env out)
COPY . .

USER node
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:5001/health || exit 1
CMD ["node", "src/server.js"]