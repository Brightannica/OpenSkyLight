# ===== Build Stage =====
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git sqlite

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build:web

# ===== Production Stage =====
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache sqlite curl tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/web ./dist/web
COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/package.json ./package.json

RUN npm prune --production

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:10000/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=10000
ENV START_WEB_SERVER=1

CMD ["tini", "--", "node", "dist/server/server.js"]
