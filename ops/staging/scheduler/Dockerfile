FROM node:24.18.0-alpine
WORKDIR /opt/outside
ENV NODE_ENV=production
COPY scheduler.mjs alert-sink.mjs ./
RUN addgroup --system --gid 1001 outside \
    && adduser --system --uid 1001 --ingroup outside outside
USER outside
EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9090/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scheduler.mjs"]
