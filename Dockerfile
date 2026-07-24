# syntax=docker/dockerfile:1.7
ARG APP_VERSION=0.2.0-rc.1
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

FROM node:24.18.0-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

FROM base AS dependencies
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS builder
COPY . .
# Build-time values are non-production sentinels, never deployment secrets.
# Runtime validation still fails closed unless real runtime values are supplied.
RUN AUTH_SECRET=build-only-auth-secret-at-least-thirty-two-bytes \
    OUTSIDE_VERIFY_SECRET=build-only-verify-secret-at-least-thirty-two \
    CRON_SECRET=build-only-cron-secret-at-least-thirty-two-bytes \
    RESEND_API_KEY=build-only-resend-value \
    EMAIL_FROM=build@outside.invalid \
    APP_URL=https://build.outside.invalid \
    OUTSIDE_STORAGE_MODE=database \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    npm run build

FROM dependencies AS migrator
ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_TIME
ENV NODE_ENV=production
LABEL org.opencontainers.image.title="OUTSIDE migrator" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.source="https://github.com/domcolelak/outside"
ENTRYPOINT ["./node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

FROM base AS runner
ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_TIME
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    OUTSIDE_APP_VERSION=${APP_VERSION} \
    OUTSIDE_GIT_SHA=${GIT_SHA} \
    OUTSIDE_BUILD_TIME=${BUILD_TIME} \
    PORT=3000 \
    HOSTNAME=0.0.0.0
LABEL org.opencontainers.image.title="OUTSIDE" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.source="https://github.com/domcolelak/outside"
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
