# Self-hosted image (Coolify, docs/SELF_HOST.md): the built app plus the AI endpoint in one Node process (server/host.ts).
# Cloudflare deploys keep using wrangler.jsonc and never read this file.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
 && npx esbuild server/start.ts --bundle --platform=node --format=esm --target=node22 --outfile=build/server.mjs

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DIST_DIR=/app/dist DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/server.mjs ./server.mjs
# /data holds the daily AI budget; mount a volume there so redeploys keep the count.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
