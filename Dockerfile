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

RUN apk add --no-cache sqlite curl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:10000/api/health || exit 1

ENV PORT=10000

CMD ["npm", "run", "start:web"]
