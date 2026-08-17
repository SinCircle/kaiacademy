# syntax=docker/dockerfile:1

FROM node:22.14-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev:docker"]

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22.14-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/api-worker.ts /app/wrangler.api.jsonc /app/tsconfig.json ./
COPY --from=build /app/app/api ./app/api
COPY --from=build /app/app/lib ./app/lib
COPY --from=build /app/db ./db
COPY --from=build /app/email ./email
RUN node scripts/prepare-wrangler-config.mjs
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
CMD ["npm", "run", "start:docker"]
