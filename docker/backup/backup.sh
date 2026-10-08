#!/bin/sh
# pg_dump comprimido con fecha + borrado de backups más viejos que BACKUP_RETENTION_DAYS.
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="/backups/${PGDATABASE}-${STAMP}.sql.gz"
echo "[backup] $(date -Iseconds) generando ${FILE}"
pg_dump --no-owner --no-privileges | gzip -9 > "${FILE}.tmp"
mv "${FILE}.tmp" "${FILE}"
find /backups -name "${PGDATABASE}-*.sql.gz" -type f -mtime +"${BACKUP_RETENTION_DAYS}" -print -delete
echo "[backup] listo ($(du -h "${FILE}" | cut -f1))"
