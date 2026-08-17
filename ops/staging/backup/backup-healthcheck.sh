#!/bin/sh
set -eu
metric_prefix="${BACKUP_METRIC_PREFIX:-outside_backup}"
case "${metric_prefix}" in *[!a-z0-9_]*|"") exit 1;; esac
grep -q "^${metric_prefix}_last_success_unixtime " "/metrics/${metric_prefix}.prom"
