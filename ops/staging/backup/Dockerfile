FROM postgres:16.14-alpine
RUN apk add --no-cache age
WORKDIR /opt/outside
COPY backup.sh restore.sh backup-loop.sh ./
RUN chmod 0555 backup.sh restore.sh backup-loop.sh \
    && mkdir -p /backups /metrics \
    && chown -R postgres:postgres /backups /metrics
USER postgres
HEALTHCHECK --interval=60s --timeout=3s --start-period=30s --retries=3 \
  CMD metric_prefix="${BACKUP_METRIC_PREFIX:-outside_backup}"; grep -q "^${metric_prefix}_last_success_unixtime " "/metrics/${metric_prefix}.prom"
CMD ["/opt/outside/backup-loop.sh"]
