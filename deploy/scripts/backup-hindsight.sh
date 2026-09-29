#!/usr/bin/env bash
#
# EpistemicOps — Hindsight Local Backup Script
# Creates a compressed snapshot of the embedded pg0 database directory.
# Run periodically via cron or prior to system maintenance.
#
set -euo pipefail

BACKUP_DIR="${HOME}/backups/hindsight"
DATA_DIR="${HOME}/.hindsight/data"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_FILE="${BACKUP_DIR}/hindsight_backup_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$DATA_DIR" ]; then
    echo "[!] Warning: Hindsight data directory does not exist at $DATA_DIR"
    exit 0
fi

echo "[*] Creating backup of Hindsight memory state..."
tar -czf "$TARGET_FILE" -C "${HOME}/.hindsight" data

echo "[✓] Backup created successfully: $TARGET_FILE ($(du -h "$TARGET_FILE" | cut -f1))"

# Retention: keep the last 7 backups, delete older ones
echo "[*] Cleaning up older backups (retaining last 7)..."
ls -t "${BACKUP_DIR}"/hindsight_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "[✓] Backup complete."
