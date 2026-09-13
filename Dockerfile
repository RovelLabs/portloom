# Production Dockerfile for Portloom Gateway
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORTLOOM_PORT=24224
ENV APPDATA=/data

RUN mkdir -p /data/Portloom && chown -R node:node /app /data

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/assets ./assets

USER node

EXPOSE 24224 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:24224/api/status || exit 1

VOLUME ["/data"]

CMD ["node", "dist/server.js"]
