#!/bin/sh
# Programa backup.sh con crond (busybox) según BACKUP_CRON.
set -eu
echo "${BACKUP_CRON} /bin/sh /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] programado: ${BACKUP_CRON} (retención ${BACKUP_RETENTION_DAYS} días)"
exec crond -f -l 8
