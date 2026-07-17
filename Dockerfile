# syntax=docker/dockerfile:1.7
FROM node:20.20.0-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

FROM base AS dependencies
COPY package.json package-lock.json ./
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
ENV NODE_ENV=production
ENTRYPOINT ["./node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
